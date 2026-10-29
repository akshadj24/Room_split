
from pydantic import ConfigDict
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "development"
    DATABASE_URL: str
    SESSION_SECRET: str
    JWT_SECRET: str | None = None
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7
    FRONTEND_ORIGIN: str = "http://localhost:5173"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = ""

    @property
    def jwt_secret(self) -> str:
        return self.JWT_SECRET or self.SESSION_SECRET

settings = Settings()
