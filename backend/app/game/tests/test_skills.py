import pytest

from app.game.engine import GameRuleError, create_state, use_skill
from app.game.fixtures import DEFAULT_MAP, demo_entity
from app.game.models import Position, SkillInstance
from app.game.skills.skill_template import EffectConfig, SkillTemplate
from app.game.skills.targeting import TargetingError


def test_bomb_skill_deals_ten_damage_and_is_consumed() -> None:
    caster = demo_entity("a", "A", 0, 0, 1, speed=10)
    target = demo_entity("b", "B", 1, 0, 2, speed=8)
    state = create_state(DEFAULT_MAP, [caster, target])
    template = SkillTemplate(
        id="bomb",
        name="Bomb",
        description="",
        category="common",
        cost=1,
        range=3,
        targetType="single",
        areaType="single",
        effects=[EffectConfig(type="damage", value=10, metadata={"fixedDamage": True})],
    )

    use_skill(state, "a", "a_bomb_1", template, target_id="b")

    assert target.currentHp == 90
    assert caster.temporaryAP == 1
    assert caster.skillInstances == []


def test_skill_range_and_one_time_instance_are_validated() -> None:
    caster = demo_entity("a", "A", 0, 0, 1, speed=10)
    target = demo_entity("b", "B", 7, 7, 2, speed=8)
    state = create_state(DEFAULT_MAP, [caster, target])
    template = SkillTemplate(
        id="bomb",
        name="Bomb",
        description="",
        category="common",
        cost=1,
        range=3,
        targetType="single",
        areaType="single",
        effects=[EffectConfig(type="damage", value=10)],
    )

    with pytest.raises(TargetingError):
        use_skill(state, "a", "a_bomb_1", template, target_id="b")
    with pytest.raises(GameRuleError):
        use_skill(state, "b", "b_bomb_1", template, target_id="a")


def test_skill_can_apply_multiple_effects() -> None:
    caster = demo_entity("a", "A", 0, 0, 1, speed=10)
    target = demo_entity("b", "B", 1, 0, 2, speed=8)
    caster.currentHp = 50
    caster.skillInstances = [SkillInstance("drain_1", "drain", "start_common")]
    state = create_state(DEFAULT_MAP, [caster, target])
    template = SkillTemplate(
        id="drain",
        name="Drain",
        description="",
        category="common",
        cost=1,
        range=1,
        targetType="single",
        areaType="single",
        effects=[
            EffectConfig(type="damage", value=10, metadata={"fixedDamage": True}),
            EffectConfig(type="heal", value=5),
        ],
        canTargetEnemy=True,
    )

    use_skill(state, "a", "drain_1", template, target_id="b")

    assert target.currentHp == 95
    assert caster.currentHp == 50


def test_line_skill_hits_non_allied_targets_in_direction() -> None:
    caster = demo_entity("a", "A", 0, 0, 1, speed=10)
    enemy_one = demo_entity("b", "B", 1, 0, 2, speed=8)
    ally = demo_entity("c", "C", 2, 0, 3, speed=7)
    enemy_two = demo_entity("d", "D", 3, 0, 4, speed=6)
    ally.ownerId = "a"
    caster.skillInstances = [SkillInstance("line_1", "line_bomb", "start_common")]
    state = create_state(DEFAULT_MAP, [caster, enemy_one, ally, enemy_two])
    template = SkillTemplate(
        id="line_bomb",
        name="Line Bomb",
        description="",
        category="common",
        cost=1,
        range=4,
        targetType="direction",
        areaType="line",
        effects=[EffectConfig(type="damage", value=10, metadata={"fixedDamage": True})],
    )

    use_skill(state, "a", "line_1", template, direction="right")

    assert enemy_one.currentHp == 90
    assert ally.currentHp == 100
    assert enemy_two.currentHp == 90
