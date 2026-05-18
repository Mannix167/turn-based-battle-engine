from app.game.fixtures import DEFAULT_MAP, demo_entity
from app.game.models import StatusEffect
from app.game.turn_queue import end_current_action
from app.game.engine import create_state


def test_stun_skips_one_action_opportunity() -> None:
    first = demo_entity("a", "A", 0, 0, 1, speed=10)
    stunned = demo_entity("b", "B", 1, 0, 2, speed=8)
    stunned.statusEffects.append(StatusEffect("stun_1", "stun", "a", "b"))
    state = create_state(DEFAULT_MAP, [first, stunned])

    end_current_action(state, "a")

    assert state.currentEntityId == "a"
    assert stunned.statusEffects == []


def test_burn_triggers_on_action_start_and_expires() -> None:
    burned = demo_entity("a", "A", 0, 0, 1, speed=10)
    burned.statusEffects.append(StatusEffect("burn_1", "burn", "b", "a", duration=1, remainingTurns=1, value=7))
    state = create_state(DEFAULT_MAP, [burned])

    assert burned.currentHp == 93
    assert burned.statusEffects == []
    assert state.currentEntityId == "a"


def test_delayed_damage_triggers_after_remaining_turns() -> None:
    source = demo_entity("a", "A", 0, 0, 1, speed=10)
    target = demo_entity("b", "B", 1, 0, 2, speed=8)
    target.statusEffects.append(
        StatusEffect("delayed_1", "delayed_damage", "a", "b", duration=1, remainingTurns=1, value=10)
    )
    state = create_state(DEFAULT_MAP, [source, target])

    end_current_action(state, "a")

    assert target.currentHp == 95
    assert target.statusEffects == []


def test_temporary_stat_modifier_reverts_when_duration_expires() -> None:
    entity = demo_entity("a", "A", 0, 0, 1, speed=10)
    entity.currentAttack += 5
    entity.statusEffects.append(
        StatusEffect(
            "stat_1",
            "stat_modifier",
            "a",
            "a",
            duration=1,
            remainingTurns=1,
            value=5,
            metadata={"stat": "attack"},
        )
    )

    create_state(DEFAULT_MAP, [entity])

    assert entity.currentAttack == 20
    assert entity.statusEffects == []
