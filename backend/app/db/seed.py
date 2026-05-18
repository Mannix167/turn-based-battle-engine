import json

from sqlalchemy import select

from app.db.database import SessionLocal
from app.db.models import CharacterRecord


def seed_database() -> None:
    with SessionLocal() as db:
        exists = db.scalar(select(CharacterRecord.id).limit(1))
        if exists:
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
                    default_skill_template_ids=json.dumps(["guard_up"]),
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
                    default_skill_template_ids=json.dumps(["quick_shot"]),
                ),
            ]
        )
        db.commit()
