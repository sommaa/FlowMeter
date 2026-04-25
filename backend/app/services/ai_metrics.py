"""
AI suggestion workflow metrics.

Captures one record per suggest request (provider, model, latency, token
counts, success/error, retry count) into an in-memory ring buffer and an
append-only JSONL file on disk. Read back through ``/api/v1/ai/metrics``.

Design notes:
    - **No prompt text, no column descriptions, no guidance are stored.** The
      record is numeric/categorical only; user-supplied free text never makes
      it onto disk by construction. Categorical string fields (provider,
      model, error_class, effort) are length-capped in ``__post_init__`` as
      defense-in-depth; Sprint 1's log redaction filter is a second layer.
    - Disk writes go through ``asyncio.to_thread`` so the event loop stays
      free during the append. The suggest request still awaits the write
      (it's not fire-and-forget), and there is no explicit fsync — durability
      is OS-buffered. Write failures are logged and dropped; the in-memory
      ring is the authoritative source for ``/metrics``.
    - File rotates at ~10MB: the current file is renamed to
      ``ai_metrics.jsonl.1`` and a fresh one is started. Only one rotation is
      kept; older data is discarded. ``load_recent_from_disk`` reads both
      files at startup so a recent rotation doesn't blank the ring.
    - Single-process assumption: FlowMeter runs as one uvicorn worker, so
      the ring and the JSONL appender don't coordinate across processes. A
      multi-worker deployment would need file locking and a shared store.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from collections import deque
from dataclasses import dataclass, asdict, fields
from pathlib import Path
from typing import Any, Iterable, Optional
from uuid import uuid4

logger = logging.getLogger(__name__)


# Cap the in-memory ring so /metrics reads stay bounded (O(n) over the ring,
# but n is at most _RING_MAX) and memory usage is constant.
_RING_MAX = 200

# Hard cap on categorical string fields. These come from validated upstream
# code today (provider enum, model id from the API, error_class.value), but
# truncating defensively keeps the "no free-form text on disk" promise honest
# even if a future caller passes through something unexpected.
_STR_FIELD_MAX = 64

# Rotate the JSONL sink when it exceeds this many bytes.
_JSONL_ROTATE_BYTES = 10 * 1024 * 1024

# Path to the on-disk sink. Resolved relative to the backend package root so
# the file lives alongside `data/models`, `data/templates`.
_DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
_JSONL_PATH = _DATA_DIR / "ai_metrics.jsonl"
_JSONL_ROTATION_PATH = _DATA_DIR / "ai_metrics.jsonl.1"


# Per-1K-token prices live in a JSON sidecar so they can be updated without
# code changes. Default file ships next to this module; users can override
# the path via the AI_PRICING_PATH env var (handy when running from a
# packaged install where editing the bundled file isn't convenient).
#
# JSON shape:
#   {"<provider>": {"<model_id>": {"input": <usd_per_1k>, "output": ..., "cache_read": ...}}}
#
# Unknown (provider, model) pairs produce ``cost_usd=None`` everywhere —
# raw token counts are always exported, costs are best-effort.
_DEFAULT_PRICING_PATH = Path(__file__).resolve().parent / "ai_pricing.json"


def _pricing_path() -> Path:
    override = os.environ.get("AI_PRICING_PATH")
    return Path(override) if override else _DEFAULT_PRICING_PATH


def _load_pricing_from_disk() -> dict[tuple[str, str], dict[str, float]]:
    """Read and flatten the pricing JSON into a `(provider, model) -> rates` dict.

    Any I/O or parse error logs a warning and returns ``{}`` — costs simply
    become None until the file is fixed; the suggest path stays unaffected.
    """
    path = _pricing_path()
    if not path.exists():
        logger.info("AIMetrics: no pricing file at %s; cost_usd will be None.", path)
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("AIMetrics: failed to load pricing from %s: %s", path, exc)
        return {}

    flat: dict[tuple[str, str], dict[str, float]] = {}
    for provider, models in raw.items():
        if provider.startswith("_") or not isinstance(models, dict):
            continue  # skip "_doc" and other metadata keys
        for model_id, rates in models.items():
            if not isinstance(rates, dict):
                continue
            try:
                flat[(provider, model_id)] = {k: float(v) for k, v in rates.items()}
            except (TypeError, ValueError) as exc:
                logger.warning(
                    "AIMetrics: bad rates for %s/%s in %s: %s",
                    provider, model_id, path, exc,
                )
    return flat


_pricing_cache: Optional[dict[tuple[str, str], dict[str, float]]] = None


def _get_pricing() -> dict[tuple[str, str], dict[str, float]]:
    """Lazy-loaded module-level pricing table. Use this everywhere."""
    global _pricing_cache
    if _pricing_cache is None:
        _pricing_cache = _load_pricing_from_disk()
    return _pricing_cache


def reload_pricing() -> None:
    """Drop the cached pricing table so the next call re-reads the JSON.

    Useful for tests, or for picking up a hand-edit without restarting the
    backend.
    """
    global _pricing_cache
    _pricing_cache = None


@dataclass
class AIMetricsRecord:
    """One row of suggest-workflow telemetry.

    Values are all numeric/categorical — never free-form user text. The
    ``error_class`` field is stored as a string (its enum value) so the
    on-disk JSONL stays provider-agnostic.
    """

    timestamp: float
    request_id: str
    provider: str
    model: str
    latency_ms: float
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    cache_creation_tokens: int
    retry_count: int
    success: bool
    error_class: Optional[str] = None  # AIErrorClass.value
    effort: Optional[str] = None
    num_suggestions: int = 0
    num_ainvoke_calls: int = 0

    def __post_init__(self) -> None:
        # Length-cap categorical strings so a misbehaving caller can't smuggle
        # free-form text onto disk via these fields.
        self.request_id = (self.request_id or "")[:_STR_FIELD_MAX]
        self.provider = (self.provider or "")[:_STR_FIELD_MAX]
        self.model = (self.model or "")[:_STR_FIELD_MAX]
        if self.error_class is not None:
            self.error_class = self.error_class[:_STR_FIELD_MAX]
        if self.effort is not None:
            self.effort = self.effort[:_STR_FIELD_MAX]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "AIMetricsRecord":
        """Construct a record from a dict, ignoring fields the dataclass
        doesn't know about. Lets us evolve the schema without breaking
        ``load_recent_from_disk`` against older JSONL rows.
        """
        known = {f.name for f in fields(cls)}
        return cls(**{k: v for k, v in d.items() if k in known})


def new_request_id() -> str:
    """Return a short, unique request id for correlating log/metrics lines."""
    return uuid4().hex[:12]


def extract_usage(response, provider: str) -> dict[str, int]:
    """Pull normalized token counts out of a LangChain response.

    Handles three provider shapes (Anthropic `usage_metadata`, OpenAI
    `usage_metadata`, Gemini `response_metadata.usage_metadata`) and returns
    missing fields as 0. Only Claude surfaces cache counters today; the rest
    come through as 0.
    """
    out = {
        "input_tokens": 0,
        "output_tokens": 0,
        "cache_read_tokens": 0,
        "cache_creation_tokens": 0,
    }

    usage: dict = {}
    for attr in ("usage_metadata", "response_metadata"):
        value = getattr(response, attr, None)
        if not isinstance(value, dict):
            continue
        if attr == "response_metadata":
            # OpenAI / Gemini stash usage inside response_metadata["usage"|"usage_metadata"].
            usage = value.get("usage") or value.get("usage_metadata") or {}
        else:
            usage = value
        if usage:
            break
    if not usage:
        return out

    out["input_tokens"] = int(
        usage.get("input_tokens")
        or usage.get("prompt_tokens")
        or usage.get("prompt_token_count")
        or 0
    )
    out["output_tokens"] = int(
        usage.get("output_tokens")
        or usage.get("completion_tokens")
        or usage.get("candidates_token_count")
        or 0
    )

    # Claude cache counters — check both top-level and the nested
    # input_token_details block used by newer LangChain adapter versions.
    details = usage.get("input_token_details") or {}
    out["cache_read_tokens"] = int(
        usage.get("cache_read_input_tokens")
        or details.get("cache_read")
        or 0
    )
    out["cache_creation_tokens"] = int(
        usage.get("cache_creation_input_tokens")
        or details.get("cache_creation")
        or 0
    )
    return out


def compute_cost_usd(record: AIMetricsRecord) -> Optional[float]:
    """Estimate USD cost for a record, or None if we don't have a price row.

    Anthropic reports input/cache_read/cache_creation tokens as three disjoint
    buckets in ``usage_metadata`` — they don't overlap, so each is charged at
    its own rate:
        - ``input``: regular (non-cached) prompt tokens
        - ``cache_read``: tokens served from a prior cache write (≈10% of input)
        - ``cache_creation``: tokens written into the cache (≈125% of input)
    OpenAI/Gemini don't expose these counters, so cache_* will be 0 there.
    Missing rate keys fall back to the input rate, which yields a conservative
    over-estimate rather than silently dropping cost.
    """
    rates = _get_pricing().get((record.provider, record.model))
    if not rates:
        return None
    input_rate = rates.get("input", 0.0)
    cache_read_rate = rates.get("cache_read", input_rate)
    cache_creation_rate = rates.get("cache_creation", input_rate)
    return round(
        (record.input_tokens / 1000) * input_rate
        + (record.output_tokens / 1000) * rates.get("output", 0.0)
        + (record.cache_read_tokens / 1000) * cache_read_rate
        + (record.cache_creation_tokens / 1000) * cache_creation_rate,
        6,
    )


# ============= Collector =============

class _Collector:
    """Module-level singleton; use ``get_collector()`` rather than instantiating."""

    def __init__(self) -> None:
        self._ring: deque[AIMetricsRecord] = deque(maxlen=_RING_MAX)
        # Guards concurrent writers appending to the same JSONL file.
        self._write_lock = asyncio.Lock()

    # ---- read path ---------------------------------------------------

    def recent(self, limit: int = 50) -> list[AIMetricsRecord]:
        if limit <= 0:
            return []
        # Most-recent first.
        data = list(self._ring)
        return data[-limit:][::-1]

    def __len__(self) -> int:
        return len(self._ring)

    # ---- write path --------------------------------------------------

    async def record(self, rec: AIMetricsRecord) -> None:
        """Append a record to the in-memory ring and the on-disk JSONL.

        Disk failures are swallowed — the ring is the source of truth for
        the /metrics endpoint and must survive filesystem issues.
        """
        self._ring.append(rec)
        try:
            async with self._write_lock:
                await asyncio.to_thread(self._append_jsonl_sync, rec.to_dict())
        except Exception as exc:  # pragma: no cover - defensive, never breaks suggest
            logger.warning("AIMetrics: failed to persist record to JSONL: %s", exc)

    def _append_jsonl_sync(self, payload: dict[str, Any]) -> None:
        _DATA_DIR.mkdir(parents=True, exist_ok=True)
        # Rotate first if the file is already past the cap. Do this before
        # appending so the resulting file never massively overshoots.
        try:
            if _JSONL_PATH.exists() and _JSONL_PATH.stat().st_size >= _JSONL_ROTATE_BYTES:
                if _JSONL_ROTATION_PATH.exists():
                    _JSONL_ROTATION_PATH.unlink()
                _JSONL_PATH.rename(_JSONL_ROTATION_PATH)
        except OSError as exc:
            logger.warning("AIMetrics: rotation failed: %s", exc)

        line = json.dumps(payload, separators=(",", ":"), ensure_ascii=False) + "\n"
        with _JSONL_PATH.open("a", encoding="utf-8") as f:
            f.write(line)

    # ---- persistence -------------------------------------------------

    def load_recent_from_disk(self, n: int = _RING_MAX) -> int:
        """Repopulate the in-memory ring from the JSONL file(s) at startup.

        Reads the rotated file first then the current file, so a recent
        rotation doesn't drop the ring back to empty. Keeps only the last
        ``n`` rows across both files. Malformed rows and unknown fields
        (from older schema versions) are tolerated. Safe to call when no
        files exist — returns 0.
        """
        paths = [p for p in (_JSONL_ROTATION_PATH, _JSONL_PATH) if p.exists()]
        if not paths:
            return 0
        # Pull tail lines from each file, then take the last n across the pair.
        # ``deque(maxlen=n)`` over a chained iterator gives O(total_lines) time
        # but only O(n) memory for the line buffer.
        tail: deque[str] = deque(maxlen=n)
        try:
            for path in paths:
                with path.open("r", encoding="utf-8") as f:
                    for line in f:
                        tail.append(line)
        except OSError as exc:
            logger.warning("AIMetrics: load_recent_from_disk failed: %s", exc)
            return 0

        loaded = 0
        for raw in tail:
            raw = raw.strip()
            if not raw:
                continue
            try:
                d = json.loads(raw)
                self._ring.append(AIMetricsRecord.from_dict(d))
                loaded += 1
            except (json.JSONDecodeError, TypeError, ValueError) as exc:
                logger.debug("AIMetrics: skipping malformed row: %s", exc)
        logger.info(
            "AIMetrics: loaded %d records from %s",
            loaded, [str(p) for p in paths],
        )
        return loaded

    def clear(self) -> None:
        """Test-only: drop all in-memory records."""
        self._ring.clear()


_collector: Optional[_Collector] = None


def get_collector() -> _Collector:
    """Return the module-level collector, lazily constructed."""
    global _collector
    if _collector is None:
        _collector = _Collector()
    return _collector


# ============= Aggregations for /metrics =============

def _percentile(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    sv = sorted(values)
    # Canonical nearest-rank: idx = ceil(P/100 * N) - 1, clamped to [0, N-1].
    # Computed via integer ceiling to avoid float-rounding drift.
    n = len(sv)
    rank = (int(p) * n + 99) // 100  # ceil(p * n / 100), 1-indexed
    idx = min(n - 1, max(0, rank - 1))
    return round(sv[idx], 2)


def build_aggregates(records: Iterable[AIMetricsRecord]) -> dict[str, Any]:
    """Summary statistics over an arbitrary set of records.

    Always returns the same keys so the frontend can render tiles without
    branching on missing fields.
    """
    recs = list(records)
    if not recs:
        return {
            "count": 0,
            "p50_latency_ms": 0.0,
            "p95_latency_ms": 0.0,
            "success_rate": 0.0,
            "by_provider": {},
            "total_cost_usd": None,
            "cost_known_count": 0,
            "cost_unknown_count": 0,
        }

    latencies = [r.latency_ms for r in recs]
    ok = sum(1 for r in recs if r.success)
    by_provider: dict[str, dict[str, Any]] = {}
    total_cost: Optional[float] = None
    cost_known = 0
    cost_unknown = 0

    for r in recs:
        bp = by_provider.setdefault(r.provider, {
            "count": 0,
            "success": 0,
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_read_tokens": 0,
        })
        bp["count"] += 1
        bp["success"] += 1 if r.success else 0
        bp["input_tokens"] += r.input_tokens
        bp["output_tokens"] += r.output_tokens
        bp["cache_read_tokens"] += r.cache_read_tokens

        cost = compute_cost_usd(r)
        if cost is None:
            cost_unknown += 1
        else:
            cost_known += 1
            total_cost = (total_cost or 0.0) + cost

    return {
        "count": len(recs),
        "p50_latency_ms": _percentile(latencies, 50),
        "p95_latency_ms": _percentile(latencies, 95),
        "success_rate": round(ok / len(recs), 4),
        "by_provider": by_provider,
        # ``total_cost_usd`` covers only records with a price row in the
        # pricing JSON. If ``cost_unknown_count > 0`` the total understates
        # actual spend; the frontend should flag this rather than treat the
        # number as authoritative.
        "total_cost_usd": (round(total_cost, 6) if total_cost is not None else None),
        "cost_known_count": cost_known,
        "cost_unknown_count": cost_unknown,
    }
