from datetime import UTC, datetime
import json
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import MonsterTemplateRecord
from app.schemas.monster import MonsterTemplateCreate, MonsterTemplateRead, MonsterTemplateUpdate


router = APIRouter()

DEFAULT_MONSTER_TOKEN = "/api/monster-templates/icons/default.svg"
DEFAULT_MONSTER_PORTRAIT = "/api/monster-templates/icons/default.svg"


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def record_to_schema(record: MonsterTemplateRecord) -> MonsterTemplateRead:
    return MonsterTemplateRead(
        id=record.id,
        name=record.name,
        description=record.description,
        maxHp=record.max_hp,
        baseAttack=record.base_attack,
        baseDefense=record.base_defense,
        attackRange=record.attack_range,
        speed=record.speed,
        critRate=record.crit_rate,
        luck=record.luck,
        tempApPerTurn=record.temp_ap_per_turn if record.temp_ap_per_turn is not None else 1,
        rarity=record.rarity or "common",
        tokenImageUrl=record.token_image_url or DEFAULT_MONSTER_TOKEN,
        portraitImageUrl=record.portrait_image_url or DEFAULT_MONSTER_PORTRAIT,
        enabled=bool(record.enabled),
        canSpawnAsMonster=bool(record.can_spawn_as_monster),
        canBeSummoned=bool(record.can_be_summoned),
        summonSkillTemplateIds=json.loads(record.summon_skill_template_ids or "[]"),
        createdAt=record.created_at,
        updatedAt=record.updated_at,
    )


def validate_payload(payload: MonsterTemplateCreate | MonsterTemplateUpdate) -> list[str]:
    errors: list[str] = []
    if not payload.name.strip():
        errors.append("Monster name is required")
    if payload.maxHp <= 0:
        errors.append("maxHp must be greater than 0")
    if payload.baseAttack < 0:
        errors.append("baseAttack must be greater than or equal to 0")
    if payload.baseDefense < 0:
        errors.append("baseDefense must be greater than or equal to 0")
    if payload.attackRange < 1:
        errors.append("attackRange must be greater than or equal to 1")
    if payload.critRate < 0 or payload.critRate > 100:
        errors.append("critRate must be between 0 and 100")
    return errors


def apply_payload(record: MonsterTemplateRecord, payload: MonsterTemplateCreate | MonsterTemplateUpdate) -> None:
    stamp = now_iso()
    record.name = payload.name.strip()
    record.description = payload.description
    record.max_hp = payload.maxHp
    record.base_attack = payload.baseAttack
    record.base_defense = payload.baseDefense
    record.attack_range = payload.attackRange
    record.speed = payload.speed
    record.crit_rate = payload.critRate
    record.luck = payload.luck
    record.temp_ap_per_turn = max(0, payload.tempApPerTurn)
    record.rarity = payload.rarity
    record.token_image_url = payload.tokenImageUrl or DEFAULT_MONSTER_TOKEN
    record.portrait_image_url = payload.portraitImageUrl or DEFAULT_MONSTER_PORTRAIT
    record.enabled = 1 if payload.enabled else 0
    record.can_spawn_as_monster = 1 if payload.canSpawnAsMonster else 0
    record.can_be_summoned = 1 if payload.canBeSummoned else 0
    record.summon_skill_template_ids = json.dumps(payload.summonSkillTemplateIds)
    record.updated_at = stamp
    if not record.created_at:
        record.created_at = stamp


@router.get("", response_model=list[MonsterTemplateRead])
def list_monsters(
    include_disabled: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[MonsterTemplateRead]:
    records = db.query(MonsterTemplateRecord).order_by(MonsterTemplateRecord.name).all()
    return [record_to_schema(record) for record in records if include_disabled or record.enabled]


@router.post("", response_model=MonsterTemplateRead, status_code=201)
def create_monster(payload: MonsterTemplateCreate, db: Session = Depends(get_db)) -> MonsterTemplateRead:
    errors = validate_payload(payload)
    if errors:
        raise HTTPException(status_code=400, detail=errors)
    monster_id = payload.id or f"monster_{uuid4().hex[:10]}"
    if db.get(MonsterTemplateRecord, monster_id):
        raise HTTPException(status_code=400, detail="Monster id already exists")
    record = MonsterTemplateRecord(id=monster_id, name=payload.name)
    apply_payload(record, payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record_to_schema(record)


@router.get("/icons/default.svg")
def default_monster_icon() -> Response:
    svg = """<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f59e0b"/>
      <stop offset="1" stop-color="#7c2d12"/>
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="18" fill="#1c1917"/>
  <circle cx="48" cy="48" r="30" fill="url(#g)"/>
  <path d="M27 34 L39 22 L48 34 L57 22 L69 34 L66 69 H30 Z" fill="#fed7aa" opacity="0.9"/>
  <circle cx="39" cy="48" r="5" fill="#1c1917"/>
  <circle cx="57" cy="48" r="5" fill="#1c1917"/>
  <path d="M38 63 Q48 70 58 63" stroke="#1c1917" stroke-width="5" fill="none" stroke-linecap="round"/>
</svg>"""
    return Response(content=svg, media_type="image/svg+xml")


@router.get("/{monster_id}", response_model=MonsterTemplateRead)
def get_monster(monster_id: str, db: Session = Depends(get_db)) -> MonsterTemplateRead:
    record = db.get(MonsterTemplateRecord, monster_id)
    if not record:
        raise HTTPException(status_code=404, detail="Monster template not found")
    return record_to_schema(record)


@router.put("/{monster_id}", response_model=MonsterTemplateRead)
def update_monster(
    monster_id: str,
    payload: MonsterTemplateUpdate,
    db: Session = Depends(get_db),
) -> MonsterTemplateRead:
    record = db.get(MonsterTemplateRecord, monster_id)
    if not record:
        raise HTTPException(status_code=404, detail="Monster template not found")
    errors = validate_payload(payload)
    if errors:
        raise HTTPException(status_code=400, detail=errors)
    apply_payload(record, payload)
    db.commit()
    db.refresh(record)
    return record_to_schema(record)


@router.delete("/{monster_id}", status_code=204)
def delete_monster(monster_id: str, db: Session = Depends(get_db)) -> None:
    record = db.get(MonsterTemplateRecord, monster_id)
    if not record:
        raise HTTPException(status_code=404, detail="Monster template not found")
    db.delete(record)
    db.commit()


@router.post("/{monster_id}/duplicate", response_model=MonsterTemplateRead, status_code=201)
def duplicate_monster(monster_id: str, db: Session = Depends(get_db)) -> MonsterTemplateRead:
    source = get_monster(monster_id, db)
    payload = MonsterTemplateCreate(**source.model_dump(exclude={"id", "createdAt", "updatedAt"}))
    payload.id = f"monster_{uuid4().hex[:10]}"
    payload.name = f"{source.name} Copy"
    return create_monster(payload, db)
