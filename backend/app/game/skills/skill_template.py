from dataclasses import dataclass, field
from typing import Any, Literal


Rarity = Literal["common", "rare", "uncommon", "epic", "legendary"]
SkillCategory = Literal[
    "damage",
    "heal",
    "buff",
    "debuff",
    "control",
    "movement",
    "summon",
    "terrain",
    "alliance",
    "resource",
    "special",
]

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
    "set_stat_temporarily",
    "delayed_area_damage",
    "link_damage_sync",
    "create_alliance",
    "swap_current_hp",
    "conditional_execute",
    "instant_kill",
    "random_damage",
    "extra_turn_next_round",
    "alliance",
    "remove_alliance",
    "swap_attack",
    "sync_hp",
    "summon",
    "delayed_damage",
    "grant_skill",
    "change_terrain",
]


@dataclass(frozen=True)
class EffectConfig:
    type: EffectType
    value: int | None = None
    duration: int | None = None
    delayTurns: int | None = None
    stat: str | None = None
    buffType: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SkillVisualConfig:
    visualKey: str | None = None
    impactColor: str | None = None
    trailType: str | None = None
    soundKey: str | None = None


@dataclass(frozen=True)
class SkillTemplate:
    id: str
    name: str
    description: str
    category: Literal["character", "common"]
    cost: int
    range: int
    targetType: Literal["single", "emptyCell", "direction", "self", "twoEntities"]
    areaType: Literal["single", "line", "cross", "square", "circle", "none"]
    areaSize: int = 1
    iconUrl: str | None = None
    skillKind: Literal["built_in", "configurable"] = "built_in"
    enabled: bool = True
    usableAs: list[str] = field(default_factory=lambda: ["common", "reward"])
    rarity: Rarity = "common"
    skillPointCost: int = 1
    categories: list[SkillCategory] = field(default_factory=lambda: ["damage"])
    editable: bool = True
    isSystemSkill: bool = False
    version: int = 1
    affectSelfDamage: bool = False
    canTargetSelf: bool = False
    canTargetAlly: bool = False
    canTargetEnemy: bool = True
    canTargetEmptyCell: bool = False
    canTargetMonster: bool = True
    canTargetSummon: bool = True
    canTargetTreasure: bool = False
    canTargetTerrain: bool = False
    visual: SkillVisualConfig = field(default_factory=SkillVisualConfig)
    effects: list[EffectConfig] = field(default_factory=list)
