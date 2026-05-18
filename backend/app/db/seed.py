import json

from sqlalchemy import select

from app.db.database import SessionLocal
from app.db.models import CharacterRecord
from app.game.fixtures import SKILL_TEMPLATES


def seed_database() -> None:
    with SessionLocal() as db:
        exists = db.scalar(select(CharacterRecord.id).limit(1))
        if exists:
            sanitize_character_default_skills(db)
            return

        db.add_all(
            [
                CharacterRecord(
                    id="char_knight",
                    name="Knight",
                    description="Durable melee starter.",
                    max_hp=120,
                    base_attack=18,
                    base_defense=8,
                    attack_range=1,
                    temp_ap_per_turn=2,
                    speed=8,
                    crit_rate=10,
                    luck=45,
                    default_skill_template_ids=json.dumps([]),
                ),
                CharacterRecord(
                    id="char_ranger",
                    name="Ranger",
                    description="Fast ranged starter.",
                    max_hp=90,
                    base_attack=16,
                    base_defense=4,
                    attack_range=3,
                    temp_ap_per_turn=2,
                    speed=12,
                    crit_rate=20,
                    luck=60,
                    default_skill_template_ids=json.dumps([]),
                ),
            ]
        )
        db.commit()


def sanitize_character_default_skills(db) -> None:
    changed = False
    valid_template_ids = set(SKILL_TEMPLATES)
    for record in db.scalars(select(CharacterRecord)).all():
        template_ids = json.loads(record.default_skill_template_ids or "[]")
        filtered = [template_id for template_id in template_ids if template_id in valid_template_ids]
        if filtered != template_ids:
            record.default_skill_template_ids = json.dumps(filtered)
            changed = True
    if changed:
        db.commit()
