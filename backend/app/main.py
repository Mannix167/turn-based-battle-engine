from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api.routes_characters import router as characters_router
from app.api.routes_game import router as game_router
from app.api.routes_maps import router as maps_router
from app.api.routes_monsters import router as monsters_router
from app.api.routes_skills import router as skills_router
from app.api.routes_uploads import router as uploads_router
from app.config import UPLOAD_DIR, ensure_local_dirs
from app.db.database import Base, engine
from app.db.migrations import migrate_database
from app.db.seed import seed_database


def create_app() -> FastAPI:
    ensure_local_dirs()
    Base.metadata.create_all(bind=engine)
    migrate_database(engine)
    seed_database()

    app = FastAPI(title="Turn-Based Grid Game v2")
    app.include_router(characters_router, prefix="/api/characters", tags=["characters"])
    app.include_router(monsters_router, prefix="/api/monster-templates", tags=["monster-templates"])
    app.include_router(skills_router, prefix="/api/skills", tags=["skills"])
    app.include_router(maps_router, prefix="/api/maps", tags=["maps"])
    app.include_router(game_router, prefix="/api/game", tags=["game"])
    app.include_router(uploads_router, prefix="/api/uploads", tags=["uploads"])
    app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
