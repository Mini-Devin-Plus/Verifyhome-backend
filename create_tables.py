"""Create all tables in the configured database."""
from app.config import settings
from app.models import Base
from app.database import engine


def main() -> None:
    Base.metadata.create_all(bind=engine)
    print(f"Tables created in {settings.DATABASE_URL}")
    for table in Base.metadata.sorted_tables:
        print(f"  - {table.name}")


if __name__ == "__main__":
    main()
