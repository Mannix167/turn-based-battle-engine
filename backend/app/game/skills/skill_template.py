from dataclasses import dataclass, field
from typing import Any, Literal


EffectType = Literal[
    "damage",
    "heal",
    "add_buff",
    "remove_buff",
    "modify_stat",
    "add_permanent_ap",
    "add_temporary_ap",
    "extra_turn_next_round",
    "alliance",
    "remove_alliance",
    "swap_attack",
    "sync_hp",
    "summon",
    "delayed_damage",
    "grant_skill",
]


@dataclass(frozen=True)
class EffectConfig:
    type: EffectType
    value: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SkillTemplate:
    id: str
    name: str
    description: str
    category: Literal["character", "common"]
    cost: int
    range: int
    targetType: Literal["single", "emptyCell", "direction", "self"]
    areaType: Literal["single", "line", "cross", "square", "none"]
    canTargetSelf: bool = False
    canTargetAlly: bool = False
    canTargetEnemy: bool = True
    canTargetEmptyCell: bool = False
    effects: list[EffectConfig] = field(default_factory=list)
