from app.game.fixtures import DEFAULT_MAP, demo_entity
from app.game.models import BattleEntity
from app.game.turn_queue import end_current_action, generate_round_queue
from app.game.engine import create_state


def test_turn_queue_sorts_by_speed_then_join_order() -> None:
    slow = demo_entity("slow", "Slow", 0, 0, 1, speed=5)
    fast_late = demo_entity("fast_late", "Fast Late", 1, 0, 3, speed=10)
    fast_early = demo_entity("fast_early", "Fast Early", 2, 0, 2, speed=10)
    state = create_state(DEFAULT_MAP, [slow, fast_late, fast_early])

    state.roundNumber = 1
    queue = generate_round_queue(state)

    assert queue == ["fast_early", "fast_late", "slow"]


def test_end_action_clears_temp_ap_and_advances_actor() -> None:
    first = demo_entity("first", "First", 0, 0, 1, speed=10)
    second = demo_entity("second", "Second", 1, 0, 2, speed=8)
    state = create_state(DEFAULT_MAP, [first, second])

    assert state.currentEntityId == "first"
    assert first.temporaryAP == 2
    end_current_action(state, "first")

    assert first.temporaryAP == 0
    assert state.currentEntityId == "second"
    assert second.temporaryAP == 2


def test_extra_turn_and_dead_entities() -> None:
    a = demo_entity("a", "A", 0, 0, 1, speed=10)
    b = demo_entity("b", "B", 1, 0, 2, speed=8)
    c = demo_entity("c", "C", 2, 0, 3, speed=7)
    c.isAlive = False
    state = create_state(DEFAULT_MAP, [a, b, c])
    b.extraTurnNextRound = 1
    state.roundNumber = 2

    queue = generate_round_queue(state)

    assert queue == ["a", "b", "b"]
    assert b.extraTurnNextRound == 0


def test_summon_joins_next_round_not_current_round() -> None:
    owner = demo_entity("owner", "Owner", 0, 0, 1, speed=10)
    summon = BattleEntity(
        id="s",
        type="summon",
        name="Summon",
        ownerId="owner",
        controllerId="owner",
        x=1,
        y=0,
        maxHp=30,
        currentHp=30,
        baseAttack=8,
        currentAttack=8,
        baseDefense=1,
        currentDefense=1,
        attackRange=1,
        tempApPerTurn=1,
        speed=20,
        critRate=0,
        luck=0,
        joinOrder=2,
        activeRound=2,
    )
    state = create_state(DEFAULT_MAP, [owner, summon])

    assert "s" not in generate_round_queue(state)
    state.roundNumber = 2
    assert generate_round_queue(state) == ["s", "owner"]
