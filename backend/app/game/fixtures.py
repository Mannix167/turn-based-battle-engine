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

SKILL_TEMPLATES: dict[str, SkillTemplate] = {
    "bomb": SkillTemplate(
        id="bomb",
        name="Bomb",
        description="Deal 10 damage to one enemy. One use only.",
        category="common",
        cost=1,
        range=3,
        targetType="single",
        areaType="single",
        canTargetSelf=False,
        canTargetAlly=False,
        canTargetEnemy=True,
        canTargetEmptyCell=False,
        effects=[EffectConfig(type="damage", value=10, metadata={"fixedDamage": True})],
    )
}


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
