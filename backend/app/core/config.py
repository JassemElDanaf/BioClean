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
	# Single shared password gating the whole app (see main.py's auth
	# middleware) - numbers only, change anytime via .env, no restart-time
	# code change needed.
	app_password: str = "123123456456"


settings = Settings()
