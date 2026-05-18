import json

from sqlalchemy import delete, select

from app.db.database import SessionLocal
from app.db.models import CharacterRecord, MapRecord, SkillRecord
from app.game.fixtures import SKILL_TEMPLATES


def seed_database() -> None:
    with SessionLocal() as db:
        cleanup_contract_test_records(db)
        ensure_starter_character(
            db,
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
        )
        ensure_starter_character(
            db,
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
        )
        sanitize_character_default_skills(db)
        db.commit()


def cleanup_contract_test_records(db) -> None:
    db.execute(delete(CharacterRecord).where(CharacterRecord.id.like("char_contract_%")))
    db.execute(delete(MapRecord).where(MapRecord.id.like("map_contract_%")))
    db.execute(delete(SkillRecord).where(SkillRecord.id.like("skill_contract_%")))
    db.execute(delete(SkillRecord).where(SkillRecord.id.like("skill_disabled_%")))


def ensure_starter_character(db, record: CharacterRecord) -> None:
    if db.get(CharacterRecord, record.id):
        return
    db.add(record)


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
