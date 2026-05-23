import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import CharacterRecord
from app.api.routes_skills import get_template_by_id
from app.schemas.character import CharacterCreate, CharacterRead, CharacterUpdate


router = APIRouter()


def to_schema(record: CharacterRecord) -> CharacterRead:
    return CharacterRead(
        id=record.id,
        name=record.name,
        description=record.description,
        maxHp=record.max_hp,
        baseAttack=record.base_attack,
        baseDefense=record.base_defense,
        attackRange=record.attack_range,
        tempApPerTurn=record.temp_ap_per_turn,
        speed=record.speed,
        critRate=record.crit_rate,
        luck=record.luck,
        rarity=record.rarity or "common",
        skillPointCapacity=record.skill_point_capacity if record.skill_point_capacity is not None else 3,
        portraitImageUrl=record.portrait_image_url,
        tokenImageUrl=record.token_image_url,
        defaultSkillTemplateIds=json.loads(record.default_skill_template_ids or "[]"),
    )


def apply_payload(record: CharacterRecord, payload: CharacterCreate | CharacterUpdate) -> None:
    record.name = payload.name
    record.description = payload.description
    record.max_hp = max(1, payload.maxHp)
    record.base_attack = max(1, payload.baseAttack)
    record.base_defense = max(0, payload.baseDefense)
    record.attack_range = max(1, payload.attackRange)
    record.temp_ap_per_turn = max(0, payload.tempApPerTurn)
    record.speed = max(0, payload.speed)
    record.crit_rate = min(100, max(0, payload.critRate))
    record.luck = min(100, max(0, payload.luck))
    record.rarity = payload.rarity or "common"
    record.skill_point_capacity = max(0, payload.skillPointCapacity)
    record.portrait_image_url = payload.portraitImageUrl
    record.token_image_url = payload.tokenImageUrl
    record.default_skill_template_ids = json.dumps(payload.defaultSkillTemplateIds)


def validate_character_skills(db: Session, template_ids: list[str]) -> None:
    if len(template_ids) != len(set(template_ids)):
        raise HTTPException(status_code=400, detail="Character skills cannot contain duplicates")
    if len(template_ids) > 2:
        raise HTTPException(status_code=400, detail="A character can have at most 2 character skills")
    for template_id in template_ids:
        template = get_template_by_id(template_id, db)
        if not template:
            raise HTTPException(status_code=400, detail=f"Skill does not exist: {template_id}")
        if not template.enabled or "character" not in template.usableAs:
            raise HTTPException(status_code=400, detail=f"Skill cannot be used as character skill: {template_id}")


@router.get("", response_model=list[CharacterRead])
def list_characters(db: Session = Depends(get_db)) -> list[CharacterRead]:
    records = db.scalars(select(CharacterRecord).order_by(CharacterRecord.name)).all()
    return [to_schema(record) for record in records]


@router.get("/{character_id}", response_model=CharacterRead)
def get_character(character_id: str, db: Session = Depends(get_db)) -> CharacterRead:
    record = db.get(CharacterRecord, character_id)
    if not record:
        raise HTTPException(status_code=404, detail="Character not found")
    return to_schema(record)


@router.post("", response_model=CharacterRead, status_code=201)
def create_character(payload: CharacterCreate, db: Session = Depends(get_db)) -> CharacterRead:
    validate_character_skills(db, payload.defaultSkillTemplateIds)
    record = CharacterRecord(id=payload.id or f"char_{uuid4().hex[:10]}", name=payload.name)
    apply_payload(record, payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return to_schema(record)


@router.put("/{character_id}", response_model=CharacterRead)
def update_character(
    character_id: str,
    payload: CharacterUpdate,
    db: Session = Depends(get_db),
) -> CharacterRead:
    record = db.get(CharacterRecord, character_id)
    if not record:
        raise HTTPException(status_code=404, detail="Character not found")
    validate_character_skills(db, payload.defaultSkillTemplateIds)
    apply_payload(record, payload)
    db.commit()
    db.refresh(record)
    return to_schema(record)


@router.delete("/{character_id}", status_code=204)
def delete_character(character_id: str, db: Session = Depends(get_db)) -> None:
    record = db.get(CharacterRecord, character_id)
    if not record:
        raise HTTPException(status_code=404, detail="Character not found")
    db.delete(record)
    db.commit()
