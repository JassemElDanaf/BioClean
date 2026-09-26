"""Tracks which logged-in user (see config.py's `users` dict) is behind the
current request. Set once by main.py's auth middleware right after a Basic
Auth check succeeds; read anywhere a service needs to stamp "who did this"
(stock movements, the audit log) without threading a `user` parameter
through every function call."""

from contextvars import ContextVar

_current_user: ContextVar[str] = ContextVar("current_user", default="unknown")


def set_current_user(username: str) -> None:
	_current_user.set(username)


def get_current_user() -> str:
	return _current_user.get()
