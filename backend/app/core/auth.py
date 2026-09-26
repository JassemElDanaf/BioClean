"""Login sessions: a signed, expiring cookie (HMAC-SHA256 over stdlib
`hmac`/`hashlib` - no extra dependency needed for something this small)
rather than a database-backed session table, since the whole user roster
is 3 fixed people (see config.py's `users` dict). Also tracks which
logged-in user is behind the *current* request via a contextvar, set once
by main.py's auth middleware after the cookie verifies; read anywhere a
service needs to stamp "who did this" (stock movements, the audit log)
without threading a `user` parameter through every function call."""

import hashlib
import hmac
import time
from contextvars import ContextVar

from .config import settings

SESSION_COOKIE = "bioclean_session"
SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60  # 30 days - a shared shop device that should stay logged in

_current_user: ContextVar[str | None] = ContextVar("current_user", default=None)


def set_current_user(username: str | None) -> None:
	_current_user.set(username)


def get_current_user() -> str:
	# Falls back to "unknown" rather than raising - callers (StockMovement,
	# audit rows) always want *some* string to stamp, and every real
	# request path that reaches them has already gone through the auth
	# middleware and set a real username first.
	return _current_user.get() or "unknown"


def _sign(payload: str) -> str:
	return hmac.new(settings.session_secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def create_session_token(username: str) -> str:
	expires_at = int(time.time()) + SESSION_MAX_AGE_SECONDS
	payload = f"{username}:{expires_at}"
	return f"{payload}:{_sign(payload)}"


def verify_session_token(token: str | None) -> str | None:
	"""Returns the username if `token` is a still-valid, unmodified token
	this server issued; None for anything else (missing, expired, or
	tampered with - hmac.compare_digest is used specifically so a forged
	signature can't be brute-forced via response-time differences)."""
	if not token:
		return None
	parts = token.split(":")
	if len(parts) != 3:
		return None
	username, expires_at, signature = parts
	payload = f"{username}:{expires_at}"
	if not hmac.compare_digest(_sign(payload), signature):
		return None
	if int(expires_at) < time.time():
		return None
	return username
