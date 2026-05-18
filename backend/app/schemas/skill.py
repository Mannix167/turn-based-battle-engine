from typing import Any, Literal

from pydantic import BaseModel, Field


EffectType = Literal[
    "damage",
    "heal",
    "add_buff",
    "remove_buff",
    "modify_stat",
    "add_permanent_ap",
    "add_temporary_ap",
    "grant_permanent_ap",
    "grant_temporary_ap",
    "grant_random_common_skill",
    "extra_turn_next_round",
    "alliance",
    "remove_alliance",
    "swap_attack",
    "sync_hp",
    "summon",
    "delayed_damage",
    "grant_skill",
]


class EffectConfig(BaseModel):
    type: EffectType
    value: int | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class SkillTemplateBase(BaseModel):
    name: str
    description: str = ""
    iconUrl: str | None = None
    skillKind: Literal["built_in", "configurable"] = "configurable"
    enabled: bool = True
    usableAs: list[Literal["character", "common", "reward", "summon"]] = ["common", "reward"]
    category: Literal["character", "common"]
    cost: int = Field(ge=0)
    range: int = Field(ge=0)
    targetType: Literal["single", "emptyCell", "direction", "self"]
    areaType: Literal["single", "line", "cross", "square", "none"]
    canTargetSelf: bool = False
    canTargetAlly: bool = False
    canTargetEnemy: bool = True
    canTargetEmptyCell: bool = False
    effects: list[EffectConfig]


class SkillTemplateCreate(SkillTemplateBase):
    id: str | None = None


class SkillTemplateUpdate(SkillTemplateBase):
    pass


class SkillTemplateRead(SkillTemplateBase):
    id: str
