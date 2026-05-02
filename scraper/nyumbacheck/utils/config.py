"""Central configuration loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:password@localhost:5432/nyumbacheck"
    redis_url: str = "redis://localhost:6379/0"

    # Celery
    celery_broker_url: str = "redis://localhost:6379/1"
    celery_result_backend: str = "redis://localhost:6379/2"

    # Scraper behaviour
    scraper_rate_limit_rps: float = 0.5  # requests per second per domain
    scraper_request_timeout: int = 30
    scraper_max_retries: int = 3
    scraper_proxy_url: str | None = None
    scraper_user_agent: str = (
        "NyumbaCheckBot/1.0 (+https://nyumbacheck.co.ke/bot)"
    )

    # Storage
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket_name: str = "nyumbacheck-assets"
    r2_account_id: str | None = None
    r2_public_url: str | None = None

    # Notifications
    resend_api_key: str | None = None
    email_from: str = "noreply@nyumbacheck.co.ke"
    africas_talking_username: str | None = None
    africas_talking_api_key: str | None = None

    # Monitoring
    sentry_dsn: str | None = None
    log_level: str = "info"

    # API
    python_api_port: int = 8000
    python_api_host: str = "0.0.0.0"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore"


settings = Settings()
