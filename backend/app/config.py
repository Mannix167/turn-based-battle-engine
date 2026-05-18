from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "uploads"
DATABASE_URL = f"sqlite:///{DATA_DIR / 'game.db'}"


def ensure_local_dirs() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / "portraits").mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / "tokens").mkdir(parents=True, exist_ok=True)
