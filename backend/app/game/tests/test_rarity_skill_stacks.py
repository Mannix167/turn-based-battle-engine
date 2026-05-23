from random import Random

from app.game.engine import create_state, use_skill
from app.game.fixtures import DEFAULT_MAP, demo_entity
from app.game.models import SkillInstance
from app.game.reward import grant_skill, weighted_choice_by_rarity
from app.game.skills.skill_template import EffectConfig, SkillTemplate


def test_grant_skill_stacks_to_three_and_discards_extra() -> None:
    entity = demo_entity("actor", "Actor", 0, 0, 1)
    state = create_state(DEFAULT_MAP, [entity])
    entity.skillInstances.clear()

    assert grant_skill(entity, "bomb", "random_reward", max_quantity=3, log=state.log)
    assert grant_skill(entity, "bomb", "kill_reward", max_quantity=3, log=state.log)
    assert grant_skill(entity, "bomb", "treasure", max_quantity=3, log=state.log)
    assert grant_skill(entity, "bomb", "random_reward", max_quantity=3, log=state.log) is None

    assert len(entity.skillInstances) == 1
    stack = entity.skillInstances[0]
    assert stack.quantity == 3
    assert stack.maxQuantity == 3
    assert set(stack.sourceTypes) == {"reward"}
    assert "reward discarded" in state.log[-1]


def test_using_stacked_skill_decrements_then_removes_at_zero() -> None:
    caster = demo_entity("caster", "Caster", 0, 0, 1)
    target = demo_entity("target", "Target", 1, 0, 2)
    caster.skillInstances = [SkillInstance("stack_1", "poke", "start_common", quantity=2, maxQuantity=3)]
    state = create_state(DEFAULT_MAP, [caster, target])
    template = SkillTemplate(
        id="poke",
        name="Poke",
        description="Test stack use",
        category="common",
        cost=1,
        range=3,
        targetType="single",
        areaType="single",
        effects=[EffectConfig("damage", 1)],
    )

    use_skill(state, "caster", "stack_1", template, target_id="target")
    assert caster.skillInstances[0].quantity == 1

    caster.temporaryAP = 2
    use_skill(state, "caster", "stack_1", template, target_id="target")
    assert caster.skillInstances == []


def test_weighted_choice_uses_rarity_drop_weights() -> None:
    picks = [
        weighted_choice_by_rarity(
            Random(seed),
            ["common_skill", "legendary_skill"],
            {"common_skill": "common", "legendary_skill": "legendary"},
            {"common": 50, "rare": 25, "uncommon": 15, "epic": 8, "legendary": 2},
        )
        for seed in range(200)
    ]

    assert picks.count("common_skill") > picks.count("legendary_skill")
