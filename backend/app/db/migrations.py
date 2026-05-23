from sqlalchemy import text
from sqlalchemy.engine import Engine


SKILL_COLUMNS: dict[str, str] = {
    "rarity": "VARCHAR DEFAULT 'common'",
    "skill_point_cost": "INTEGER DEFAULT 1",
    "categories_json": "TEXT DEFAULT '[\"damage\"]'",
    "editable": "INTEGER DEFAULT 1",
    "is_system_skill": "INTEGER DEFAULT 0",
    "version": "INTEGER DEFAULT 1",
    "area_size": "INTEGER DEFAULT 1",
    "affect_self_damage": "INTEGER DEFAULT 0",
    "can_target_monster": "INTEGER DEFAULT 1",
    "can_target_summon": "INTEGER DEFAULT 1",
    "can_target_treasure": "INTEGER DEFAULT 0",
    "can_target_terrain": "INTEGER DEFAULT 0",
    "visual_json": "TEXT DEFAULT '{}'",
}

CHARACTER_COLUMNS: dict[str, str] = {
    "rarity": "VARCHAR DEFAULT 'common'",
    "skill_point_capacity": "INTEGER DEFAULT 3",
}

MONSTER_COLUMNS: dict[str, str] = {
    "temp_ap_per_turn": "INTEGER DEFAULT 1",
    "rarity": "VARCHAR DEFAULT 'common'",
    "can_spawn_as_monster": "INTEGER DEFAULT 1",
    "can_be_summoned": "INTEGER DEFAULT 0",
    "summon_skill_template_ids": "TEXT DEFAULT '[]'",
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
        existing_characters = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(characters)")).fetchall()
        }
        for column, definition in CHARACTER_COLUMNS.items():
            if column not in existing_characters:
                connection.execute(text(f"ALTER TABLE characters ADD COLUMN {column} {definition}"))
        existing_monsters = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(monster_templates)")).fetchall()
        }
        for column, definition in MONSTER_COLUMNS.items():
            if column not in existing_monsters:
                connection.execute(text(f"ALTER TABLE monster_templates ADD COLUMN {column} {definition}"))
