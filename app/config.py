"""VerifyHome backend configuration."""
import os


class Settings:
    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "sqlite:///./verifyhome.db"
    )

    # Security
    JWT_SECRET: str = os.getenv("JWT_SECRET", "verifyhome-dev-secret-change-me")
    JWT_EXPIRES_MINUTES: int = int(os.getenv("JWT_EXPIRES_MINUTES", "1440"))

    # OTP provider: "mock" | "termii"
    OTP_PROVIDER: str = os.getenv("OTP_PROVIDER", "mock")
    TERMII_API_KEY: str = os.getenv("TERMII_API_KEY", "")
    TERMII_SENDER_ID: str = os.getenv("TERMII_SENDER_ID", "VerifyHome")

    # Payments provider: "mock" | "paystack" | "flutterwave"
    PAYMENT_PROVIDER: str = os.getenv("PAYMENT_PROVIDER", "mock")
    PAYSTACK_SECRET_KEY: str = os.getenv("PAYSTACK_SECRET_KEY", "")
    PAYSTACK_PUBLIC_KEY: str = os.getenv("PAYSTACK_PUBLIC_KEY", "")
    FLUTTERWAVE_SECRET_KEY: str = os.getenv("FLUTTERWAVE_SECRET_KEY", "")

    # Real-time provider (calls)
    CALL_PROVIDER: str = os.getenv("CALL_PROVIDER", "mock")

    # Public API URL exposed to the mobile app
    PUBLIC_API_URL: str = os.getenv("PUBLIC_API_URL", "http://localhost:8000")

    @property
    def mock_otp(self) -> bool:
        return self.OTP_PROVIDER == "mock"

    @property
    def mock_payments(self) -> bool:
        return self.PAYMENT_PROVIDER == "mock"


settings = Settings()
