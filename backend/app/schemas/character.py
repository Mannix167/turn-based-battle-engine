from typing import Literal

from pydantic import BaseModel, Field

Rarity = Literal["common", "rare", "uncommon", "epic", "legendary"]


class CharacterBase(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    maxHp: int = Field(default=100, ge=1)
    baseAttack: int = Field(default=20, ge=1)
    baseDefense: int = Field(default=5, ge=0)
    attackRange: int = Field(default=1, ge=1)
    tempApPerTurn: int = Field(default=2, ge=0)
    speed: int = Field(default=10, ge=0)
    critRate: int = Field(default=10, ge=0, le=100)
    luck: int = Field(default=50, ge=0, le=100)
    rarity: Rarity = "common"
    skillPointCapacity: int = Field(default=3, ge=0)
    portraitImageUrl: str | None = None
    tokenImageUrl: str | None = None
    defaultSkillTemplateIds: list[str] = []


class CharacterCreate(CharacterBase):
    id: str | None = None


class CharacterUpdate(CharacterBase):
    pass


class CharacterRead(CharacterBase):
    id: str
