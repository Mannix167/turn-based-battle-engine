import json
from dataclasses import asdict
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import SkillRecord
from app.game.fixtures import SKILL_TEMPLATES
from app.game.skills.skill_template import EffectConfig, SkillTemplate
from app.schemas.skill import SkillTemplateCreate, SkillTemplateRead, SkillTemplateUpdate


router = APIRouter()


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def record_to_template(record: SkillRecord) -> SkillTemplate:
    return SkillTemplate(
        id=record.id,
        name=record.name,
        description=record.description,
        category=record.category,
        iconUrl=record.icon_url,
        skillKind=record.skill_kind,
        enabled=bool(record.enabled),
        usableAs=json.loads(record.usable_as_json or "[]"),
        cost=record.cost,
        range=record.range,
        targetType=record.target_type,
        areaType=record.area_type,
        canTargetSelf=bool(record.can_target_self),
        canTargetAlly=bool(record.can_target_ally),
        canTargetEnemy=bool(record.can_target_enemy),
        canTargetEmptyCell=bool(record.can_target_empty_cell),
        effects=[EffectConfig(**effect) for effect in json.loads(record.effects_json or "[]")],
    )


def template_to_schema(template: SkillTemplate) -> dict:
    return asdict(template)


def all_templates(db: Session) -> dict[str, SkillTemplate]:
    templates = dict(SKILL_TEMPLATES)
    for record in db.query(SkillRecord).order_by(SkillRecord.name).all():
        templates[record.id] = record_to_template(record)
    return templates


def validate_skill_payload(payload: SkillTemplateCreate | SkillTemplateUpdate) -> list[str]:
    errors: list[str] = []
    if not payload.name.strip():
        errors.append("Skill name is required")
    if not payload.effects:
        errors.append("At least one effect is required")
    allowed_pairs = {
        ("self", "single"),
        ("self", "none"),
        ("single", "single"),
        ("emptyCell", "single"),
        ("direction", "line"),
    }
    if (payload.targetType, payload.areaType) not in allowed_pairs:
        errors.append("Invalid targetType and areaType combination")
    for effect in payload.effects:
        if effect.type in {"damage", "heal", "modify_stat", "delayed_damage"} and effect.value is None:
            errors.append(f"Effect {effect.type} requires value")
        if effect.type == "add_buff" and not (effect.metadata.get("buffType") or effect.metadata.get("type")):
            errors.append("add_buff requires metadata.buffType")
        if effect.type == "modify_stat" and not effect.metadata.get("stat"):
            errors.append("modify_stat requires metadata.stat")
        if effect.type == "summon" and payload.targetType != "emptyCell":
            errors.append("summon effect requires emptyCell targetType")
    return errors


def apply_payload(record: SkillRecord, payload: SkillTemplateCreate | SkillTemplateUpdate) -> None:
    stamp = now_iso()
    record.name = payload.name
    record.description = payload.description
    record.icon_url = payload.iconUrl
    record.skill_kind = "configurable"
    record.enabled = 1 if payload.enabled else 0
    record.usable_as_json = json.dumps(payload.usableAs)
    record.category = payload.category
    record.cost = payload.cost
    record.range = payload.range
    record.target_type = payload.targetType
    record.area_type = payload.areaType
    record.can_target_self = 1 if payload.canTargetSelf else 0
    record.can_target_ally = 1 if payload.canTargetAlly else 0
    record.can_target_enemy = 1 if payload.canTargetEnemy else 0
    record.can_target_empty_cell = 1 if payload.canTargetEmptyCell else 0
    record.effects_json = json.dumps([effect.model_dump() for effect in payload.effects])
    record.updated_at = stamp
    if not record.created_at:
        record.created_at = stamp


@router.get("/templates", response_model=list[SkillTemplateRead])
def list_templates(db: Session = Depends(get_db)) -> list[dict]:
    return [template_to_schema(template) for template in all_templates(db).values() if template.enabled]


@router.get("/templates/common", response_model=list[SkillTemplateRead])
def list_common_templates(db: Session = Depends(get_db)) -> list[dict]:
    return [
        template_to_schema(template)
        for template in all_templates(db).values()
        if template.enabled and "common" in template.usableAs
    ]


@router.get("/templates/character", response_model=list[SkillTemplateRead])
def list_character_templates(db: Session = Depends(get_db)) -> list[dict]:
    return [
        template_to_schema(template)
        for template in all_templates(db).values()
        if template.enabled and "character" in template.usableAs
    ]


@router.post("/templates", response_model=SkillTemplateRead, status_code=201)
def create_template(payload: SkillTemplateCreate, db: Session = Depends(get_db)) -> dict:
    errors = validate_skill_payload(payload)
    if errors:
        raise HTTPException(status_code=400, detail=errors)
    skill_id = payload.id or f"skill_{uuid4().hex[:10]}"
    if skill_id in SKILL_TEMPLATES or db.get(SkillRecord, skill_id):
        raise HTTPException(status_code=400, detail="Skill id already exists")
    record = SkillRecord(id=skill_id, name=payload.name)
    apply_payload(record, payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return template_to_schema(record_to_template(record))


@router.put("/templates/{skill_id}", response_model=SkillTemplateRead)
def update_template(skill_id: str, payload: SkillTemplateUpdate, db: Session = Depends(get_db)) -> dict:
    if skill_id in SKILL_TEMPLATES:
        raise HTTPException(status_code=400, detail="Built-in skills cannot be edited here")
    record = db.get(SkillRecord, skill_id)
    if not record:
        raise HTTPException(status_code=404, detail="Skill not found")
    errors = validate_skill_payload(payload)
    if errors:
        raise HTTPException(status_code=400, detail=errors)
    apply_payload(record, payload)
    db.commit()
    db.refresh(record)
    return template_to_schema(record_to_template(record))


@router.delete("/templates/{skill_id}", status_code=204)
def delete_template(skill_id: str, db: Session = Depends(get_db)) -> None:
    if skill_id in SKILL_TEMPLATES:
        raise HTTPException(status_code=400, detail="Built-in skills cannot be deleted")
    record = db.get(SkillRecord, skill_id)
    if not record:
        raise HTTPException(status_code=404, detail="Skill not found")
    db.delete(record)
    db.commit()


@router.post("/templates/{skill_id}/duplicate", response_model=SkillTemplateRead, status_code=201)
def duplicate_template(skill_id: str, db: Session = Depends(get_db)) -> dict:
    source = all_templates(db).get(skill_id)
    if not source:
        raise HTTPException(status_code=404, detail="Skill not found")
    payload = SkillTemplateCreate(**template_to_schema(source))
    payload.id = f"skill_{uuid4().hex[:10]}"
    payload.name = f"{source.name} Copy"
    payload.skillKind = "configurable"
    return create_template(payload, db)


def get_template_by_id(skill_id: str, db: Session) -> SkillTemplate | None:
    return all_templates(db).get(skill_id)
