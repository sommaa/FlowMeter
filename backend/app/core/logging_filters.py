"""Logging filters that redact third-party API keys from log output.

Attached to the root logger (and to uvicorn's access/error loggers) at app
startup so that even if a future code path logs a request body or a full
exception, Anthropic / OpenAI / Google API keys do not leak.

The match is intentionally broad: we accept a minimum of 20 body characters
after the known prefix to avoid false positives on short strings that happen
to start with `sk-` or `AIza`.
"""

import logging
import re

_REDACTED = "***REDACTED***"

# Compiled once. Order does not matter — each pattern is independent.
_SECRET_PATTERNS = [
    re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"sk-[A-Za-z0-9_\-]{20,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{35}"),
]


def redact(text: str) -> str:
    """Replace any detected API-key pattern in ``text`` with a redaction marker."""
    if not text:
        return text
    out = text
    for pat in _SECRET_PATTERNS:
        out = pat.sub(_REDACTED, out)
    return out


class SecretRedactingFilter(logging.Filter):
    """Logging filter that strips API keys from message and args.

    Mutates the ``LogRecord`` in place so that any downstream formatter sees
    the redacted content. We redact both ``record.msg`` (if it's a string)
    and each string element of ``record.args`` (tuple/list/dict).
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = redact(record.msg)

        args = record.args
        if isinstance(args, dict):
            record.args = {k: (redact(v) if isinstance(v, str) else v) for k, v in args.items()}
        elif isinstance(args, tuple):
            record.args = tuple(redact(a) if isinstance(a, str) else a for a in args)
        elif isinstance(args, list):
            record.args = [redact(a) if isinstance(a, str) else a for a in args]

        return True


def install_secret_redaction() -> None:
    """Attach ``SecretRedactingFilter`` to every handler on the root logger
    and on uvicorn loggers.

    Filters on ``Logger`` objects do not apply to records propagated from
    child loggers, so we attach the filter at the handler level (handlers
    see all records that reach them, regardless of origin). Idempotent.
    """
    filt = SecretRedactingFilter()
    target_loggers = [
        logging.getLogger(),
        logging.getLogger("uvicorn"),
        logging.getLogger("uvicorn.error"),
        logging.getLogger("uvicorn.access"),
    ]
    for lg in target_loggers:
        for handler in lg.handlers:
            if not any(isinstance(f, SecretRedactingFilter) for f in handler.filters):
                handler.addFilter(filt)
