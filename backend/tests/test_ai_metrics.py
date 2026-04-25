"""Tests for backend/app/services/ai_metrics.py."""

from __future__ import annotations

import asyncio
import json
import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.services import ai_metrics
from app.services.ai_metrics import (
    AIMetricsRecord,
    _Collector,
    _load_pricing_from_disk,
    build_aggregates,
    compute_cost_usd,
    extract_usage,
    new_request_id,
    reload_pricing,
)


def _make_record(**overrides) -> AIMetricsRecord:
    base = dict(
        timestamp=1_700_000_000.0,
        request_id="abc123",
        provider="openai",
        model="gpt-4o",
        latency_ms=123.4,
        input_tokens=100,
        output_tokens=200,
        cache_read_tokens=0,
        cache_creation_tokens=0,
        retry_count=0,
        success=True,
        error_class=None,
        effort=None,
        num_suggestions=3,
        num_ainvoke_calls=1,
    )
    base.update(overrides)
    return AIMetricsRecord(**base)


@pytest.fixture
def tmp_jsonl(tmp_path, monkeypatch):
    """Redirect the JSONL sink to a temp dir for each test."""
    jsonl = tmp_path / "ai_metrics.jsonl"
    rot = tmp_path / "ai_metrics.jsonl.1"
    monkeypatch.setattr(ai_metrics, "_DATA_DIR", tmp_path)
    monkeypatch.setattr(ai_metrics, "_JSONL_PATH", jsonl)
    monkeypatch.setattr(ai_metrics, "_JSONL_ROTATION_PATH", rot)
    return jsonl, rot


@pytest.fixture
def fixed_pricing(monkeypatch):
    """Inject a deterministic pricing table so cost tests don't depend on
    whatever rates happen to ship in `ai_pricing.json`."""
    table = {
        ("openai", "gpt-4o"): {"input": 0.0025, "output": 0.01},
        ("claude", "claude-sonnet-4-6"): {
            "input": 0.003,
            "output": 0.015,
            "cache_read": 0.0003,
            "cache_creation": 0.00375,
        },
    }
    monkeypatch.setattr(ai_metrics, "_pricing_cache", table)
    yield table
    # Force a fresh disk read for any later test in the same process.
    monkeypatch.setattr(ai_metrics, "_pricing_cache", None)


class TestExtractUsage:
    """Normalize usage dicts across providers."""

    def test_missing_usage_returns_zeros(self):
        class R:
            usage_metadata = None
            response_metadata = None
        out = extract_usage(R(), "openai")
        assert out == {
            "input_tokens": 0,
            "output_tokens": 0,
            "cache_read_tokens": 0,
            "cache_creation_tokens": 0,
        }

    def test_anthropic_usage_metadata(self):
        class R:
            usage_metadata = {
                "input_tokens": 500,
                "output_tokens": 200,
                "cache_read_input_tokens": 1200,
                "cache_creation_input_tokens": 100,
            }
            response_metadata = None
        out = extract_usage(R(), "claude")
        assert out["input_tokens"] == 500
        assert out["output_tokens"] == 200
        assert out["cache_read_tokens"] == 1200
        assert out["cache_creation_tokens"] == 100

    def test_anthropic_nested_details(self):
        class R:
            usage_metadata = {
                "input_tokens": 10,
                "output_tokens": 20,
                "input_token_details": {"cache_read": 7, "cache_creation": 3},
            }
            response_metadata = None
        out = extract_usage(R(), "claude")
        assert out["cache_read_tokens"] == 7
        assert out["cache_creation_tokens"] == 3

    def test_openai_shape_prompt_completion(self):
        class R:
            usage_metadata = {"prompt_tokens": 40, "completion_tokens": 60}
            response_metadata = None
        out = extract_usage(R(), "openai")
        assert out["input_tokens"] == 40
        assert out["output_tokens"] == 60

    def test_gemini_candidates_token_count(self):
        class R:
            usage_metadata = {
                "prompt_token_count": 30,
                "candidates_token_count": 90,
            }
            response_metadata = None
        out = extract_usage(R(), "gemini")
        assert out["input_tokens"] == 30
        assert out["output_tokens"] == 90


class TestCompute:

    def test_known_model_cost(self, fixed_pricing):
        rec = _make_record(provider="openai", model="gpt-4o", input_tokens=1000, output_tokens=500)
        # 1000/1000 * 0.0025 + 500/1000 * 0.01 = 0.0025 + 0.005 = 0.0075
        assert compute_cost_usd(rec) == pytest.approx(0.0075, rel=1e-6)

    def test_unknown_model_returns_none(self, fixed_pricing):
        rec = _make_record(provider="openai", model="gpt-9000", input_tokens=100)
        assert compute_cost_usd(rec) is None

    def test_cache_read_uses_cache_rate(self, fixed_pricing):
        rec = _make_record(
            provider="claude", model="claude-sonnet-4-6",
            input_tokens=0, output_tokens=0,
            cache_read_tokens=10_000,
        )
        # 10000/1000 * 0.0003 = 0.003
        assert compute_cost_usd(rec) == pytest.approx(0.003, rel=1e-6)

    def test_cache_creation_charged_at_write_rate(self, fixed_pricing):
        """Anthropic bills cache writes at ~125% of input. Earlier code
        ignored cache_creation tokens entirely."""
        rec = _make_record(
            provider="claude", model="claude-sonnet-4-6",
            input_tokens=0, output_tokens=0,
            cache_read_tokens=0, cache_creation_tokens=10_000,
        )
        # 10000/1000 * 0.00375 = 0.0375
        assert compute_cost_usd(rec) == pytest.approx(0.0375, rel=1e-6)

    def test_cache_creation_falls_back_to_input_rate(self, monkeypatch):
        """If a price row omits a cache_creation rate (some providers don't
        bill it separately), fall back to the input rate rather than dropping
        the cost."""
        monkeypatch.setattr(ai_metrics, "_pricing_cache", {
            ("foo", "bar"): {"input": 0.01, "output": 0.02},  # no cache_creation
        })
        rec = _make_record(
            provider="foo", model="bar",
            input_tokens=0, output_tokens=0,
            cache_creation_tokens=1000,
        )
        # 1000/1000 * 0.01 (input rate fallback) = 0.01
        assert compute_cost_usd(rec) == pytest.approx(0.01, rel=1e-6)


class TestCollectorRecord:

    def test_record_appended_to_ring_and_disk(self, tmp_jsonl):
        jsonl, _ = tmp_jsonl
        c = _Collector()
        rec = _make_record(request_id="r1")
        asyncio.run(c.record(rec))
        assert len(c) == 1
        lines = jsonl.read_text(encoding="utf-8").strip().splitlines()
        assert len(lines) == 1
        assert json.loads(lines[0])["request_id"] == "r1"

    def test_ring_overflow(self, tmp_jsonl):
        c = _Collector()
        # Force maxlen small for the test
        c._ring = __import__("collections").deque(maxlen=3)
        for i in range(5):
            asyncio.run(c.record(_make_record(request_id=f"r{i}")))
        recent = c.recent(10)
        # 5 inserted, 3 kept, most-recent-first
        assert [r.request_id for r in recent] == ["r4", "r3", "r2"]

    def test_recent_zero_limit(self, tmp_jsonl):
        c = _Collector()
        asyncio.run(c.record(_make_record()))
        assert c.recent(0) == []

    def test_disk_write_failure_does_not_break(self, tmp_jsonl, monkeypatch):
        c = _Collector()

        def _boom(payload):
            raise OSError("disk full")
        monkeypatch.setattr(c, "_append_jsonl_sync", _boom)
        # Should NOT raise — the ring stays authoritative.
        asyncio.run(c.record(_make_record(request_id="survive")))
        assert len(c) == 1
        assert c.recent(1)[0].request_id == "survive"


class TestRotation:

    def test_rotates_at_size_threshold(self, tmp_jsonl, monkeypatch):
        jsonl, rot = tmp_jsonl
        # Pre-seed file past the cap.
        monkeypatch.setattr(ai_metrics, "_JSONL_ROTATE_BYTES", 100)
        jsonl.write_text("x" * 200, encoding="utf-8")
        assert jsonl.stat().st_size >= 100
        assert not rot.exists()

        c = _Collector()
        asyncio.run(c.record(_make_record(request_id="post-rotate")))

        assert rot.exists(), "rotation target should exist"
        # New file has only the post-rotation append, not the old 200 bytes.
        body = jsonl.read_text(encoding="utf-8").strip().splitlines()
        assert len(body) == 1
        assert json.loads(body[0])["request_id"] == "post-rotate"


class TestLoadRecentFromDisk:

    def test_roundtrip(self, tmp_jsonl):
        c1 = _Collector()
        for i in range(4):
            asyncio.run(c1.record(_make_record(request_id=f"r{i}")))
        # Fresh collector reads the same file.
        c2 = _Collector()
        loaded = c2.load_recent_from_disk(n=100)
        assert loaded == 4
        ids = [r.request_id for r in c2.recent(10)]
        # recent() returns most-recent-first.
        assert ids == ["r3", "r2", "r1", "r0"]

    def test_missing_file_returns_zero(self, tmp_jsonl):
        jsonl, _ = tmp_jsonl
        if jsonl.exists():
            jsonl.unlink()
        c = _Collector()
        assert c.load_recent_from_disk() == 0

    def test_malformed_rows_are_skipped(self, tmp_jsonl):
        jsonl, _ = tmp_jsonl
        good = json.dumps(_make_record(request_id="ok").to_dict())
        jsonl.write_text(good + "\n" + "not-json\n", encoding="utf-8")
        c = _Collector()
        # Only the one valid row loads; the broken row is skipped.
        assert c.load_recent_from_disk() == 1
        assert c.recent(1)[0].request_id == "ok"


class TestAggregates:

    def test_empty_aggregates(self):
        agg = build_aggregates([])
        assert agg["count"] == 0
        assert agg["success_rate"] == 0.0
        assert agg["by_provider"] == {}
        assert agg["total_cost_usd"] is None

    def test_aggregates_compute(self, fixed_pricing):
        recs = [
            _make_record(provider="openai", model="gpt-4o", latency_ms=100, success=True,
                         input_tokens=1000, output_tokens=500),
            _make_record(provider="openai", model="gpt-4o", latency_ms=200, success=False,
                         input_tokens=0, output_tokens=0),
            _make_record(provider="claude", model="claude-sonnet-4-6", latency_ms=300,
                         success=True, input_tokens=200, output_tokens=100),
        ]
        agg = build_aggregates(recs)
        assert agg["count"] == 3
        assert agg["success_rate"] == pytest.approx(2 / 3, rel=1e-3)
        assert agg["p50_latency_ms"] == 200
        assert agg["by_provider"]["openai"]["count"] == 2
        assert agg["by_provider"]["openai"]["success"] == 1
        assert agg["by_provider"]["claude"]["count"] == 1
        # Known models → total_cost_usd is non-null.
        assert agg["total_cost_usd"] is not None
        assert agg["total_cost_usd"] > 0

    def test_aggregates_unknown_model_cost_none_overall(self, fixed_pricing):
        recs = [_make_record(provider="openai", model="gpt-zzz")]
        agg = build_aggregates(recs)
        assert agg["total_cost_usd"] is None
        assert agg["cost_known_count"] == 0
        assert agg["cost_unknown_count"] == 1

    def test_aggregates_partial_cost_flagged(self, fixed_pricing):
        """Mixed known/unknown models surface a ``cost_unknown_count`` so
        the frontend can flag a partial total instead of treating it as
        authoritative."""
        recs = [
            _make_record(provider="openai", model="gpt-4o", input_tokens=1000, output_tokens=0),
            _make_record(provider="openai", model="gpt-zzz"),
        ]
        agg = build_aggregates(recs)
        assert agg["total_cost_usd"] is not None
        assert agg["cost_known_count"] == 1
        assert agg["cost_unknown_count"] == 1


class TestPercentile:
    """Canonical nearest-rank: idx = ceil(p/100 * N) - 1, clamped to [0, N-1]."""

    def test_p50_of_1_to_10_is_5(self):
        from app.services.ai_metrics import _percentile
        assert _percentile([float(i) for i in range(1, 11)], 50) == 5.0

    def test_p95_of_1_to_100_is_95(self):
        from app.services.ai_metrics import _percentile
        # ceil(95) = 95, idx 94 -> 95th element.
        assert _percentile([float(i) for i in range(1, 101)], 95) == 95.0

    def test_p100_returns_max(self):
        from app.services.ai_metrics import _percentile
        assert _percentile([1.0, 5.0, 9.0], 100) == 9.0

    def test_single_value(self):
        from app.services.ai_metrics import _percentile
        assert _percentile([42.0], 95) == 42.0

    def test_empty_returns_zero(self):
        from app.services.ai_metrics import _percentile
        assert _percentile([], 50) == 0.0


class TestRecordValidation:
    """Length caps + schema tolerance defend the 'no free-form text on disk'
    promise even if a future caller passes in something unexpected."""

    def test_string_fields_truncated(self):
        rec = AIMetricsRecord(
            timestamp=0.0, request_id="r" * 200,
            provider="P" * 200, model="M" * 200,
            latency_ms=0.0, input_tokens=0, output_tokens=0,
            cache_read_tokens=0, cache_creation_tokens=0,
            retry_count=0, success=True,
            error_class="E" * 200, effort="F" * 200,
        )
        assert len(rec.request_id) == 64
        assert len(rec.provider) == 64
        assert len(rec.model) == 64
        assert len(rec.error_class) == 64
        assert len(rec.effort) == 64

    def test_from_dict_ignores_unknown_keys(self):
        """Older JSONL rows with retired fields (or future rows with new
        ones) shouldn't blow up reconstruction."""
        d = _make_record(request_id="ok").to_dict()
        d["future_field"] = "ignored"
        d["another_unknown"] = 42
        rec = AIMetricsRecord.from_dict(d)
        assert rec.request_id == "ok"


class TestLoadFromRotation:

    def test_rotation_file_is_read_too(self, tmp_jsonl):
        """If a rotation just happened, recent rows in `.jsonl.1` must still
        repopulate the ring on restart."""
        jsonl, rot = tmp_jsonl
        # Pre-rotation rows landed in the rotation file.
        rot.write_text(
            json.dumps(_make_record(request_id="old1").to_dict()) + "\n"
            + json.dumps(_make_record(request_id="old2").to_dict()) + "\n",
            encoding="utf-8",
        )
        # A fresher row lives in the active file.
        jsonl.write_text(
            json.dumps(_make_record(request_id="new1").to_dict()) + "\n",
            encoding="utf-8",
        )
        c = _Collector()
        loaded = c.load_recent_from_disk(n=100)
        assert loaded == 3
        ids = [r.request_id for r in c.recent(10)]
        # recent() is most-recent-first; the active file is appended after
        # the rotated one, so its rows are the most recent.
        assert ids == ["new1", "old2", "old1"]


class TestRedactionByConstruction:
    """Records must be numeric/categorical only — no user text leaks in."""

    def test_record_schema_has_no_text_payload(self):
        rec = _make_record()
        fields = set(rec.to_dict().keys())
        # Forbid any field that could hold user input.
        for forbidden in ("guidance_text", "prompt", "system_prompt",
                          "column_descriptions", "user_text", "content"):
            assert forbidden not in fields


def test_new_request_id_is_short_and_unique():
    ids = {new_request_id() for _ in range(200)}
    assert len(ids) == 200
    assert all(len(i) == 12 for i in ids)


class TestPricingLoader:
    """Verify the JSON-backed pricing loader handles the documented shape
    plus the failure modes (missing file, malformed JSON, stray keys)."""

    def test_env_override_loads_custom_file(self, tmp_path, monkeypatch):
        custom = tmp_path / "rates.json"
        custom.write_text(json.dumps({
            "_doc": "ignored",
            "openai": {"gpt-test": {"input": 0.5, "output": 1.0}},
        }), encoding="utf-8")
        monkeypatch.setenv("AI_PRICING_PATH", str(custom))

        flat = _load_pricing_from_disk()
        assert flat[("openai", "gpt-test")] == {"input": 0.5, "output": 1.0}
        # Underscore-prefixed metadata keys are ignored.
        assert ("_doc", "ignored") not in flat

    def test_missing_file_returns_empty(self, tmp_path, monkeypatch):
        monkeypatch.setenv("AI_PRICING_PATH", str(tmp_path / "does-not-exist.json"))
        assert _load_pricing_from_disk() == {}

    def test_malformed_json_returns_empty(self, tmp_path, monkeypatch):
        bad = tmp_path / "bad.json"
        bad.write_text("{not json", encoding="utf-8")
        monkeypatch.setenv("AI_PRICING_PATH", str(bad))
        assert _load_pricing_from_disk() == {}

    def test_compute_cost_uses_loaded_table(self, tmp_path, monkeypatch):
        custom = tmp_path / "rates.json"
        custom.write_text(json.dumps({
            "openai": {"gpt-test": {"input": 0.5, "output": 1.0}},
        }), encoding="utf-8")
        monkeypatch.setenv("AI_PRICING_PATH", str(custom))
        # Force the module-level cache to re-read from disk via the env var.
        monkeypatch.setattr(ai_metrics, "_pricing_cache", None)

        rec = AIMetricsRecord(
            timestamp=0.0, request_id="r", provider="openai", model="gpt-test",
            latency_ms=0.0, input_tokens=2000, output_tokens=1000,
            cache_read_tokens=0, cache_creation_tokens=0,
            retry_count=0, success=True,
        )
        # 2000/1000 * 0.5 + 1000/1000 * 1.0 = 1.0 + 1.0 = 2.0
        assert compute_cost_usd(rec) == pytest.approx(2.0, rel=1e-6)

    def test_reload_pricing_drops_cache(self, monkeypatch):
        sentinel = {("x", "y"): {"input": 1.0}}
        monkeypatch.setattr(ai_metrics, "_pricing_cache", sentinel)
        reload_pricing()
        assert ai_metrics._pricing_cache is None
