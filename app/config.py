from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: str = "development"
    APP_BASE_URL: str = "http://localhost:8000"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    DATABASE_URL: str = "sqlite:///./data/groupgo.db"
    ADMIN_USERNAME: str = "admin"
    ADMIN_PASSWORD: str = "admin"
    TMDB_API_KEY: str = ""
    SERPAPI_KEY: str = ""
    SERPAPI_RATE_LIMIT_HOURS: int = 12
    GROUP_SIZE: int = 5

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def app_base_url(self) -> str:
        return self.APP_BASE_URL.rstrip("/")

    @property
    def tmdb_base_url(self) -> str:
        return "https://api.themoviedb.org/3"

    @property
    def tmdb_image_base(self) -> str:
        return "https://image.tmdb.org/t/p"

    @property
    def serpapi_base_url(self) -> str:
        return "https://serpapi.com/search"


settings = Settings()
