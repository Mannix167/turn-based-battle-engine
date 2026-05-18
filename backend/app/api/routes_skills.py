from dataclasses import asdict

from fastapi import APIRouter

from app.game.fixtures import SKILL_TEMPLATES
from app.schemas.skill import SkillTemplateRead


router = APIRouter()


@router.get("/templates", response_model=list[SkillTemplateRead])
def list_templates() -> list[dict]:
    return [asdict(template) for template in SKILL_TEMPLATES.values()]


@router.get("/templates/common", response_model=list[SkillTemplateRead])
def list_common_templates() -> list[dict]:
    return [asdict(template) for template in SKILL_TEMPLATES.values() if template.category == "common"]


@router.get("/templates/character", response_model=list[SkillTemplateRead])
def list_character_templates() -> list[dict]:
    return [asdict(template) for template in SKILL_TEMPLATES.values() if template.category == "character"]
