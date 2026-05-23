import json

from sqlalchemy import delete, select

from app.db.database import SessionLocal
from app.db.models import CharacterRecord, MapRecord, MonsterTemplateRecord, SkillRecord
from dataclasses import asdict

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
        ensure_starter_monster(
            db,
            MonsterTemplateRecord(
                id="monster_slime",
                name="Slime",
                description="A simple close-range training monster.",
                max_hp=30,
                base_attack=8,
                base_defense=1,
                attack_range=1,
                speed=0,
                crit_rate=0,
                luck=10,
                temp_ap_per_turn=1,
                rarity="common",
                enabled=1,
                can_spawn_as_monster=1,
                can_be_summoned=1,
            ),
        )
        ensure_starter_monster(
            db,
            MonsterTemplateRecord(
                id="monster_archer",
                name="Goblin Archer",
                description="A fragile monster that counters from range.",
                max_hp=24,
                base_attack=7,
                base_defense=0,
                attack_range=3,
                speed=0,
                crit_rate=10,
                luck=20,
                temp_ap_per_turn=1,
                rarity="rare",
                enabled=1,
                can_spawn_as_monster=1,
                can_be_summoned=0,
            ),
        )
        ensure_system_skill_records(db)
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


def ensure_starter_monster(db, record: MonsterTemplateRecord) -> None:
    if db.get(MonsterTemplateRecord, record.id):
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


def ensure_system_skill_records(db) -> None:
    for template in SKILL_TEMPLATES.values():
        if db.get(SkillRecord, template.id):
            continue
        visual = asdict(template.visual)
        effects = [asdict(effect) for effect in template.effects]
        db.add(
            SkillRecord(
                id=template.id,
                name=template.name,
                description=template.description,
                icon_url=template.iconUrl,
                skill_kind="built_in",
                enabled=1,
                usable_as_json=json.dumps(template.usableAs),
                rarity=template.rarity,
                skill_point_cost=template.skillPointCost,
                categories_json=json.dumps(template.categories),
                editable=1,
                is_system_skill=1,
                version=template.version,
                category=template.category,
                cost=template.cost,
                range=template.range,
                target_type=template.targetType,
                area_type=template.areaType,
                area_size=template.areaSize,
                affect_self_damage=1 if template.affectSelfDamage else 0,
                can_target_self=1 if template.canTargetSelf else 0,
                can_target_ally=1 if template.canTargetAlly else 0,
                can_target_enemy=1 if template.canTargetEnemy else 0,
                can_target_empty_cell=1 if template.canTargetEmptyCell else 0,
                can_target_monster=1 if template.canTargetMonster else 0,
                can_target_summon=1 if template.canTargetSummon else 0,
                can_target_treasure=1 if template.canTargetTreasure else 0,
                can_target_terrain=1 if template.canTargetTerrain else 0,
                visual_json=json.dumps(visual),
                effects_json=json.dumps(effects),
            )
        )
