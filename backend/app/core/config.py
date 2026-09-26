"""Centralized settings, read from environment variables (or a .env file in
dev). Every module imports `settings` from here rather than reading
os.environ directly - one place to see/change configuration as the app
grows, and the standard FastAPI-recommended approach for this."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
	model_config = SettingsConfigDict(env_file=".env", extra="ignore")

	database_url: str = "postgresql://bioclean:bioclean@localhost:5432/bioclean"
	cors_origins: list[str] = ["http://localhost:3000"]
	api_v1_prefix: str = "/api/v1"
	# Single-operator system by design (confirmed decision - only Admin,
	# nothing more) - every module that stamps "who did this" (stock
	# movements today; POS sales, invoices, etc. later) reads this one
	# constant rather than each hardcoding its own "admin" string.
	current_user: str = "admin"

	# Per-user login gate (see main.py's auth middleware) - username ->
	# (password, role). Password is numbers-only. Hardcoded here rather
	# than a users table since the whole roster is 3 fixed people; add/
	# remove/change by editing this dict, no migration needed.
	users: dict[str, tuple[str, str]] = {
		"Admin": ("160405", "Administrator"),
		"Sandy": ("234434", "User"),
		"Jad": ("569432", "User"),
	}


settings = Settings()
