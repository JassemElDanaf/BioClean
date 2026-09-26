import hmac

from fastapi import APIRouter, HTTPException, Response

from ..core.auth import SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, create_session_token, get_current_user
from ..core.config import settings
from .schemas import LoginRequest, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserOut)
def login(payload: LoginRequest, response: Response):
	expected = settings.users.get(payload.username)
	# hmac.compare_digest even when the username itself doesn't exist (compared
	# against a fixed dummy string) - a plain `if expected is None: raise`
	# short-circuit would make a wrong-username request return faster than a
	# wrong-password one, letting a timing attack enumerate valid usernames.
	password_matches = hmac.compare_digest(payload.password, expected[0] if expected else "\0")
	if expected is None or not password_matches:
		raise HTTPException(status_code=401, detail="Incorrect username or password")

	token = create_session_token(payload.username)
	response.set_cookie(
		SESSION_COOKIE,
		token,
		max_age=SESSION_MAX_AGE_SECONDS,
		httponly=True,
		samesite="lax",
		# Not `secure=True`: this app is reached both over plain http (LAN/
		# Tailscale tailnet) and https (the public Tailscale Funnel URL) -
		# marking the cookie secure-only would silently break login on the
		# http paths. httponly + a signed, expiring token (see core/auth.py)
		# is the real protection either way.
	)
	return UserOut(username=payload.username, role=expected[1])


@router.post("/logout")
def logout(response: Response):
	response.delete_cookie(SESSION_COOKIE)
	return {"ok": True}


@router.get("/me", response_model=UserOut)
def me():
	username = get_current_user()
	role = settings.users.get(username, (None, "User"))[1]
	return UserOut(username=username, role=role)
