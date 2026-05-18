from sqlalchemy import text
from sqlalchemy.engine import Engine


SKILL_COLUMNS: dict[str, str] = {
    "area_size": "INTEGER DEFAULT 1",
    "affect_self_damage": "INTEGER DEFAULT 0",
    "can_target_monster": "INTEGER DEFAULT 1",
    "can_target_summon": "INTEGER DEFAULT 1",
    "can_target_treasure": "INTEGER DEFAULT 0",
}


def migrate_database(engine: Engine) -> None:
    with engine.begin() as connection:
        existing = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(skills)")).fetchall()
        }
        for column, definition in SKILL_COLUMNS.items():
            if column not in existing:
                connection.execute(text(f"ALTER TABLE skills ADD COLUMN {column} {definition}"))
