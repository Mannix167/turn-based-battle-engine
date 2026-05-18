import pytest

from app.game.engine import create_state, use_skill
from app.game.fixtures import DEFAULT_MAP, demo_entity
from app.game.models import Position, SkillInstance
from app.game.skills.skill_template import EffectConfig, SkillTemplate
from app.game.skills.targeting import TargetingError
from app.game.turn_queue import generate_round_queue


def summon_template() -> SkillTemplate:
    return SkillTemplate(
        id="summon_helper",
        name="Summon Helper",
        description="",
        category="common",
        cost=1,
        range=2,
        targetType="emptyCell",
        areaType="none",
        canTargetEnemy=False,
        canTargetEmptyCell=True,
        effects=[
            EffectConfig(
                type="summon",
                metadata={"name": "Helper", "maxHp": 25, "baseAttack": 7, "speed": 20},
            )
        ],
    )


def test_summon_creates_allied_entity_for_next_round() -> None:
    caster = demo_entity("a", "A", 0, 0, 1, speed=10)
    caster.skillInstances = [SkillInstance("summon_1", "summon_helper", "start_common")]
    state = create_state(DEFAULT_MAP, [caster])

    use_skill(state, "a", "summon_1", summon_template(), target_position=Position(1, 0))

    summons = [entity for entity in state.entities.values() if entity.type == "summon"]
    assert len(summons) == 1
    summon = summons[0]
    assert summon.ownerId == "a"
    assert summon.position == Position(1, 0)
    assert summon.activeRound == 2
    assert "summon_1" not in [skill.instanceId for skill in caster.skillInstances]

    assert summon.id not in generate_round_queue(state)
    state.roundNumber = 2
    assert generate_round_queue(state)[0] == summon.id


def test_summon_requires_empty_valid_cell_in_range() -> None:
    caster = demo_entity("a", "A", 0, 0, 1, speed=10)
    blocker = demo_entity("b", "B", 1, 0, 2, speed=8)
    caster.skillInstances = [SkillInstance("summon_1", "summon_helper", "start_common")]
    state = create_state(DEFAULT_MAP, [caster, blocker])

    with pytest.raises(TargetingError):
        use_skill(state, "a", "summon_1", summon_template(), target_position=Position(1, 0))
