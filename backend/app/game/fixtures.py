from app.game.models import BattleEntity, GameMap, Position, SkillInstance
from app.game.skills.skill_template import EffectConfig, SkillTemplate


DEFAULT_MAP = GameMap(id="map_default", name="Default 8x8", width=8, height=8)

MAPS: dict[str, GameMap] = {
    DEFAULT_MAP.id: DEFAULT_MAP,
    "map_cross": GameMap(
        id="map_cross",
        name="Cross Arena",
        width=5,
        height=5,
        validCells={
            Position(2, 0),
            Position(2, 1),
            Position(0, 2),
            Position(1, 2),
            Position(2, 2),
            Position(3, 2),
            Position(4, 2),
            Position(2, 3),
            Position(2, 4),
        },
    ),
}

def skill(
    skill_id: str,
    name: str,
    description: str,
    cost: int,
    target_type: str,
    effects: list[EffectConfig],
    *,
    area_type: str = "single",
    area_size: int = 1,
    range_value: int = 3,
    category: str = "common",
    usable_as: list[str] | None = None,
    can_self: bool = False,
    can_ally: bool = False,
    can_enemy: bool = True,
    can_empty: bool = False,
    can_monster: bool = True,
    can_summon: bool = True,
    affect_self_damage: bool = False,
) -> SkillTemplate:
    return SkillTemplate(
        id=skill_id,
        name=name,
        description=description,
        category=category,
        iconUrl=f"/uploads/skills/{skill_id}.png",
        skillKind="built_in",
        enabled=True,
        usableAs=usable_as or ["common", "reward"],
        cost=cost,
        range=range_value,
        targetType=target_type,
        areaType=area_type,
        areaSize=area_size,
        affectSelfDamage=affect_self_damage,
        canTargetSelf=can_self,
        canTargetAlly=can_ally,
        canTargetEnemy=can_enemy,
        canTargetEmptyCell=can_empty,
        canTargetMonster=can_monster,
        canTargetSummon=can_summon,
        effects=effects,
    )


COMMON_SKILLS = [
    skill("bomb", "炸弹", "对单个非盟友目标造成15点普通伤害。", 1, "single", [EffectConfig("damage", 15)]),
    skill("medkit", "医疗包", "治疗一个活体单位20点生命。", 1, "single", [EffectConfig("heal", 20)], can_self=True, can_ally=True),
    skill("attack_up", "攻击力提升", "永久提高一个单位3点攻击。", 1, "single", [EffectConfig("modify_stat", 3, metadata={"stat": "baseAttack"})], can_self=True, can_ally=True),
    skill("defense_up", "强身健体", "永久提高一个单位3点防御。", 1, "single", [EffectConfig("modify_stat", 3, metadata={"stat": "baseDefense"})], can_self=True, can_ally=True),
    skill("speed_up", "迅捷如风", "永久提高一个单位3点速度。", 1, "single", [EffectConfig("modify_stat", 3, metadata={"stat": "speed"})], can_self=True, can_ally=True),
    skill("lucky_clover", "幸运四叶草", "永久提高一个单位15点幸运。", 1, "single", [EffectConfig("modify_stat", 15, metadata={"stat": "luck"})], can_self=True, can_ally=True),
    skill("prepared", "早有准备", "获得3点永久行动点。", 3, "self", [EffectConfig("grant_permanent_ap", 3)], can_self=True, can_enemy=False, can_monster=False, can_summon=False),
    skill("c4_bomb", "C4炸弹", "三回合后对3x3范围造成20点伤害。", 1, "emptyCell", [EffectConfig("delayed_area_damage", 20, delayTurns=3, metadata={"delayRounds": 3})], area_type="square", area_size=3, can_empty=True),
    skill("chain_link", "铁索连环", "连接两个目标，记录伤害同步状态。", 2, "twoEntities", [EffectConfig("link_damage_sync", duration=3)], can_self=True, can_ally=True),
    skill("alliance", "结盟", "与一个目标结盟5回合。", 2, "single", [EffectConfig("create_alliance", duration=5, metadata={"duration": 5})], can_ally=True),
    skill("adrenaline", "肾上腺素", "短暂强化自身，结束后承受副作用。", 2, "self", [EffectConfig("add_buff", 5, duration=3, buffType="adrenaline", metadata={"buffType": "stat_modifier", "stat": "baseAttack", "duration": 3})], can_self=True, can_enemy=False, can_monster=False, can_summon=False, affect_self_damage=True),
    skill("iron_wall", "铜墙铁壁", "目标防御提高10点，持续2次行动。", 3, "single", [EffectConfig("modify_stat", 10, duration=2, metadata={"stat": "baseDefense", "duration": 2})], can_self=True, can_ally=True),
    skill("hp_swap", "乾坤大挪移", "交换两个目标当前生命值。", 5, "twoEntities", [EffectConfig("swap_current_hp")], can_self=True, can_ally=True),
    skill("luck_burst", "人品爆发", "目标幸运临时变为100，持续2次行动。", 3, "single", [EffectConfig("set_stat_temporarily", 100, duration=2, metadata={"stat": "luck", "duration": 2})], can_self=True, can_ally=True),
    skill("laser", "激光", "沿一个方向造成10点伤害。", 1, "direction", [EffectConfig("damage", 10)], area_type="line"),
    skill("critical_burst", "临界爆发", "获得下一次伤害强化状态。", 5, "self", [EffectConfig("add_buff", 2, buffType="next_damage_multiplier", metadata={"buffType": "next_damage_multiplier"})], can_self=True, can_enemy=False, can_monster=False, can_summon=False),
    skill("crit_up", "正中靶心", "永久提高目标10点暴击率。", 1, "single", [EffectConfig("modify_stat", 10, metadata={"stat": "critRate"})], can_self=True, can_ally=True),
    skill("stun_prison", "牢狱之灾", "眩晕一个非盟友目标1次行动。", 1, "single", [EffectConfig("add_buff", duration=1, buffType="stun", metadata={"buffType": "stun", "duration": 1})]),
    skill("burn", "灼烧", "目标接下来3次行动开始时受到6点伤害。", 1, "single", [EffectConfig("add_buff", 6, duration=3, buffType="burn", metadata={"buffType": "burn", "duration": 3})]),
    skill("arrow_rain", "箭雨", "对5x5范围内目标造成5点伤害。", 1, "emptyCell", [EffectConfig("damage", 5)], area_type="square", area_size=5, can_empty=True),
    skill("light_body", "身轻如燕", "永久提高每回合临时行动点1点。", 1, "single", [EffectConfig("modify_stat", 1, metadata={"stat": "temporaryApPerTurn"})], can_self=True, can_ally=True),
    skill("weakness", "肌无力", "永久降低非盟友目标3点攻击。", 1, "single", [EffectConfig("modify_stat", -3, metadata={"stat": "baseAttack"})]),
    skill("armor_break", "破甲", "永久降低非盟友目标3点防御。", 1, "single", [EffectConfig("modify_stat", -3, metadata={"stat": "baseDefense"})]),
    skill("bad_luck", "霉运当头", "永久降低非盟友目标15点幸运。", 1, "single", [EffectConfig("modify_stat", -15, metadata={"stat": "luck"})]),
    skill("encore", "再来一次", "目标下一轮额外行动一次。", 2, "single", [EffectConfig("extra_turn_next_round", 1)], can_self=True, can_ally=True),
    skill("curse", "诅咒", "造成目标最大生命40%的真实伤害。", 3, "single", [EffectConfig("damage", metadata={"damageType": "percent_max_hp", "percent": 0.4})]),
    skill("heavy_strike", "重击", "造成15点真实伤害。", 1, "single", [EffectConfig("damage", 15, metadata={"damageType": "true"})]),
    skill("execute", "咒死", "若目标生命低于15%，直接击杀。", 3, "single", [EffectConfig("conditional_execute", metadata={"percent": 0.15})]),
    skill("silence", "沉默", "目标3次行动机会内不能使用技能。", 2, "single", [EffectConfig("add_buff", duration=3, buffType="silence", metadata={"buffType": "silence", "duration": 3})]),
    skill("root", "禁走", "目标3次行动机会内不能移动。", 2, "single", [EffectConfig("add_buff", duration=3, buffType="root", metadata={"buffType": "root", "duration": 3})]),
    skill("random_hit", "随机一击", "造成5到30点随机普通伤害。", 1, "single", [EffectConfig("random_damage", metadata={"sides": 6, "multiplier": 5})]),
]

SKILL_TEMPLATES: dict[str, SkillTemplate] = {
    template.id: template for template in COMMON_SKILLS
}

SKILL_TEMPLATES["hero_strike"] = skill(
    "hero_strike",
    "英雄斩击",
    "角色专属技能，对单个非盟友目标造成15点真实伤害。",
    1,
    "single",
    [EffectConfig("damage", 15, metadata={"damageType": "true"})],
    range_value=1,
    category="character",
    usable_as=["character"],
)


def demo_entity(entity_id: str, name: str, x: int, y: int, join_order: int, speed: int = 10) -> BattleEntity:
    entity = BattleEntity(
        id=entity_id,
        type="character",
        name=name,
        x=x,
        y=y,
        maxHp=100,
        currentHp=100,
        baseAttack=20,
        currentAttack=20,
        baseDefense=5,
        currentDefense=5,
        attackRange=1,
        tempApPerTurn=2,
        speed=speed,
        critRate=0,
        luck=50,
        joinOrder=join_order,
    )
    entity.skillInstances.append(
        SkillInstance(instanceId=f"{entity_id}_bomb_1", templateId="bomb", source="start_common")
    )
    return entity
