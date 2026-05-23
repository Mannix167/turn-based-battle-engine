import json
from dataclasses import asdict
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import SkillRecord
from app.game.fixtures import SKILL_TEMPLATES
from app.game.skills.skill_template import EffectConfig, SkillTemplate, SkillVisualConfig
from app.schemas.skill import SkillTemplateCreate, SkillTemplateRead, SkillTemplateUpdate


router = APIRouter()

RARITY_POINT_COST = {
    "common": 1,
    "rare": 2,
    "uncommon": 3,
    "epic": 4,
    "legendary": 5,
}

ICON_PALETTE = [
    ("#203864", "#6fa8dc"),
    ("#5b2c6f", "#d7bde2"),
    ("#7d3c28", "#f5b041"),
    ("#145a32", "#58d68d"),
    ("#641e16", "#ec7063"),
    ("#0e6251", "#76d7c4"),
]


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


@router.get("/icons/{skill_id}.svg")
def skill_icon(skill_id: str) -> Response:
    first, second = ICON_PALETTE[sum(ord(char) for char in skill_id) % len(ICON_PALETTE)]
    angle = (sum(ord(char) for char in skill_id) % 4) * 45
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{second}"/>
      <stop offset="1" stop-color="{first}"/>
    </linearGradient>
  </defs>
  <rect width="96" height="96" rx="18" fill="{first}"/>
  <circle cx="48" cy="48" r="34" fill="url(#g)" opacity="0.96"/>
  <path d="M48 18 L58 42 L84 48 L58 54 L48 78 L38 54 L12 48 L38 42 Z" fill="#fff" opacity="0.82" transform="rotate({angle} 48 48)"/>
  <circle cx="48" cy="48" r="10" fill="{first}" opacity="0.88"/>
</svg>"""
    return Response(content=svg, media_type="image/svg+xml")


def record_to_template(record: SkillRecord) -> SkillTemplate:
    effects = [normalize_effect(effect) for effect in json.loads(record.effects_json or "[]")]
    categories = json.loads(record.categories_json or "[]")
    if not categories or (record.is_system_skill and categories == ["damage"] and not any(effect.type in {"damage", "random_damage", "delayed_damage", "delayed_area_damage", "conditional_execute", "instant_kill"} for effect in effects)):
        categories = infer_skill_categories_from_effects(effects)
    return SkillTemplate(
        id=record.id,
        name=record.name,
        description=record.description,
        category=record.category,
        iconUrl=record.icon_url,
        skillKind=record.skill_kind,
        enabled=bool(record.enabled),
        usableAs=json.loads(record.usable_as_json or "[]"),
        rarity=record.rarity or "common",
        skillPointCost=record.skill_point_cost if record.skill_point_cost is not None else 1,
        categories=categories,
        editable=bool(record.editable),
        isSystemSkill=bool(record.is_system_skill),
        version=record.version or 1,
        cost=record.cost,
        range=record.range,
        targetType=record.target_type,
        areaType=record.area_type,
        areaSize=record.area_size,
        affectSelfDamage=bool(record.affect_self_damage),
        canTargetSelf=bool(record.can_target_self),
        canTargetAlly=bool(record.can_target_ally),
        canTargetEnemy=bool(record.can_target_enemy),
        canTargetEmptyCell=bool(record.can_target_empty_cell),
        canTargetMonster=bool(record.can_target_monster),
        canTargetSummon=bool(record.can_target_summon),
        canTargetTreasure=bool(record.can_target_treasure),
        canTargetTerrain=bool(record.can_target_terrain),
        visual=SkillVisualConfig(**json.loads(record.visual_json or "{}")),
        effects=effects,
    )


def template_to_schema(template: SkillTemplate) -> dict:
    data = asdict(template)
    data["skillPointCost"] = max(0, data.get("skillPointCost") or RARITY_POINT_COST.get(template.rarity, 1))
    data["categories"] = data.get("categories") or infer_skill_categories(template)
    data["isSystemSkill"] = bool(data.get("isSystemSkill") or template.skillKind == "built_in")
    data["editable"] = bool(data.get("editable", True))
    return data


def all_templates(db: Session) -> dict[str, SkillTemplate]:
    templates = {key: builtin_template(value) for key, value in SKILL_TEMPLATES.items()}
    for record in db.query(SkillRecord).order_by(SkillRecord.name).all():
        templates[record.id] = record_to_template(record)
    return templates


def builtin_template(template: SkillTemplate) -> SkillTemplate:
    data = asdict(template)
    data["isSystemSkill"] = True
    data["editable"] = True
    data["skillKind"] = "built_in"
    data["skillPointCost"] = data.get("skillPointCost") or RARITY_POINT_COST.get(data.get("rarity", "common"), 1)
    data["categories"] = data.get("categories") or infer_skill_categories(template)
    data["visual"] = SkillVisualConfig(**data.get("visual", {}))
    data["effects"] = [EffectConfig(**effect) for effect in data.get("effects", [])]
    return SkillTemplate(**data)


def infer_skill_categories(template: SkillTemplate) -> list[str]:
    return infer_skill_categories_from_effects(template.effects)


def infer_skill_categories_from_effects(effects: list[EffectConfig]) -> list[str]:
    categories: set[str] = set()
    for effect in effects:
        if effect.type in {"damage", "random_damage", "delayed_damage", "delayed_area_damage", "conditional_execute", "instant_kill"}:
            categories.add("damage")
        elif effect.type == "heal":
            categories.add("heal")
        elif effect.type in {"add_buff", "modify_stat", "set_stat_temporarily", "extra_turn_next_round"}:
            categories.add("buff")
        elif effect.type in {"remove_buff", "remove_alliance"}:
            categories.add("debuff")
        elif effect.type in {"add_permanent_ap", "add_temporary_ap", "grant_permanent_ap", "grant_temporary_ap", "grant_random_common_skill", "grant_skill"}:
            categories.add("resource")
        elif effect.type in {"alliance", "create_alliance", "link_damage_sync"}:
            categories.add("alliance")
        elif effect.type == "summon":
            categories.add("summon")
        elif effect.type == "change_terrain":
            categories.add("terrain")
    return sorted(categories) or ["special"]


def normalize_effect(effect: dict) -> EffectConfig:
    metadata = dict(effect.get("metadata") or {})
    for key in ("duration", "delayTurns", "stat", "buffType"):
        if effect.get(key) is not None:
            metadata[key] = effect[key]
    return EffectConfig(
        type=effect["type"],
        value=effect.get("value"),
        duration=effect.get("duration"),
        delayTurns=effect.get("delayTurns"),
        stat=effect.get("stat"),
        buffType=effect.get("buffType"),
        metadata=metadata,
    )


def dump_effect(effect) -> dict:
    metadata = dict(effect.metadata)
    for key in ("duration", "delayTurns", "stat", "buffType"):
        value = getattr(effect, key, None)
        if value is not None:
            metadata[key] = value
    return {
        "type": effect.type,
        "value": effect.value,
        "duration": effect.duration,
        "delayTurns": effect.delayTurns,
        "stat": effect.stat,
        "buffType": effect.buffType,
        "metadata": metadata,
    }


def validate_skill_payload(payload: SkillTemplateCreate | SkillTemplateUpdate) -> list[str]:
    errors: list[str] = []
    if not payload.name.strip():
        errors.append("Skill name is required")
    if not payload.effects:
        errors.append("At least one effect is required")
    if not payload.categories:
        errors.append("At least one skill category is required")
    area_center_types = {"self", "single", "emptyCell"}
    area_types = {"single", "cross", "square", "circle"}
    allowed_pairs = {(target, area) for target in area_center_types for area in area_types}
    allowed_pairs.update({("self", "none"), ("direction", "line"), ("twoEntities", "single")})
    if (payload.targetType, payload.areaType) not in allowed_pairs:
        errors.append("Invalid targetType and areaType combination")
    for effect in payload.effects:
        if effect.type in {"damage", "heal", "modify_stat", "set_stat_temporarily", "delayed_damage"} and effect.value is None and effect.metadata.get("damageType") != "percent_max_hp":
            errors.append(f"Effect {effect.type} requires value")
        if effect.type == "add_buff" and not (effect.buffType or effect.metadata.get("buffType") or effect.metadata.get("type")):
            errors.append("add_buff requires metadata.buffType")
        if effect.type == "modify_stat" and not (effect.stat or effect.metadata.get("stat")):
            errors.append("modify_stat requires metadata.stat")
        if effect.type == "summon" and payload.targetType != "emptyCell":
            errors.append("summon effect requires emptyCell targetType")
        if effect.type == "change_terrain" and not effect.metadata.get("terrainType"):
            errors.append("change_terrain requires metadata.terrainType")
    return errors


def apply_payload(record: SkillRecord, payload: SkillTemplateCreate | SkillTemplateUpdate) -> None:
    stamp = now_iso()
    record.name = payload.name
    record.description = payload.description
    record.icon_url = payload.iconUrl
    record.skill_kind = payload.skillKind
    record.enabled = 1 if payload.enabled else 0
    record.usable_as_json = json.dumps(payload.usableAs)
    record.rarity = payload.rarity
    record.skill_point_cost = max(0, payload.skillPointCost)
    record.categories_json = json.dumps(payload.categories or ["special"])
    record.editable = 1 if payload.editable else 0
    record.is_system_skill = 1 if payload.isSystemSkill or payload.skillKind == "built_in" else 0
    record.version = max(1, payload.version)
    record.category = payload.category
    record.cost = payload.cost
    record.range = payload.range
    record.target_type = payload.targetType
    record.area_type = payload.areaType
    record.area_size = payload.areaSize
    record.affect_self_damage = 1 if payload.affectSelfDamage else 0
    record.can_target_self = 1 if payload.canTargetSelf else 0
    record.can_target_ally = 1 if payload.canTargetAlly else 0
    record.can_target_enemy = 1 if payload.canTargetEnemy else 0
    record.can_target_empty_cell = 1 if payload.canTargetEmptyCell else 0
    record.can_target_monster = 1 if payload.canTargetMonster else 0
    record.can_target_summon = 1 if payload.canTargetSummon else 0
    record.can_target_treasure = 1 if payload.canTargetTreasure else 0
    record.can_target_terrain = 1 if payload.canTargetTerrain else 0
    record.visual_json = json.dumps(payload.visual.model_dump())
    record.effects_json = json.dumps([dump_effect(effect) for effect in payload.effects])
    record.updated_at = stamp
    if not record.created_at:
        record.created_at = stamp


@router.get("/templates", response_model=list[SkillTemplateRead])
def list_templates(
    include_disabled: bool = Query(default=False),
    keyword: str | None = Query(default=None),
    rarity: str | None = Query(default=None),
    category: str | None = Query(default=None),
    enabled: bool | None = Query(default=None),
    is_system_skill: bool | None = Query(default=None),
    usable_as: str | None = Query(default=None),
    usable_common: bool | None = Query(default=None),
    usable_character: bool | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[dict]:
    templates = [
        template
        for template in all_templates(db).values()
        if include_disabled or template.enabled
    ]
    templates = filter_templates(
        templates,
        keyword=keyword,
        rarity=rarity,
        category=category,
        enabled=enabled,
        is_system_skill=is_system_skill,
        usable_as=usable_as,
        usable_common=usable_common,
        usable_character=usable_character,
    )
    return [
        template_to_schema(template)
        for template in templates
    ]


def filter_templates(
    templates: list[SkillTemplate],
    *,
    keyword: str | None = None,
    rarity: str | None = None,
    category: str | None = None,
    enabled: bool | None = None,
    is_system_skill: bool | None = None,
    usable_as: str | None = None,
    usable_common: bool | None = None,
    usable_character: bool | None = None,
) -> list[SkillTemplate]:
    query = (keyword or "").strip().lower()
    result: list[SkillTemplate] = []
    for template in templates:
        if query and query not in template.name.lower() and query not in template.description.lower() and query not in template.id.lower():
            continue
        if rarity and template.rarity != rarity:
            continue
        if category and category not in template.categories:
            continue
        if enabled is not None and template.enabled != enabled:
            continue
        if is_system_skill is not None and template.isSystemSkill != is_system_skill:
            continue
        if usable_as and usable_as not in template.usableAs:
            continue
        if usable_common is not None and ("common" in template.usableAs) != usable_common:
            continue
        if usable_character is not None and ("character" in template.usableAs) != usable_character:
            continue
        result.append(template)
    return result


@router.get("/templates/all", response_model=list[SkillTemplateRead])
def list_all_templates(db: Session = Depends(get_db)) -> list[dict]:
    return [template_to_schema(template) for template in all_templates(db).values()]


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
    record = db.get(SkillRecord, skill_id)
    if not record:
        if skill_id not in SKILL_TEMPLATES:
            raise HTTPException(status_code=404, detail="Skill not found")
        record = SkillRecord(id=skill_id, name=payload.name)
        db.add(record)
    errors = validate_skill_payload(payload)
    if errors:
        raise HTTPException(status_code=400, detail=errors)
    if skill_id in SKILL_TEMPLATES:
        payload.skillKind = "built_in"
        payload.isSystemSkill = True
        payload.editable = True
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
    payload.isSystemSkill = False
    return create_template(payload, db)


def get_template_by_id(skill_id: str, db: Session) -> SkillTemplate | None:
    return all_templates(db).get(skill_id)
