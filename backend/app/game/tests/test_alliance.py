import pytest

from app.game.alliance import add_alliance, are_allies, alliance_groups, remove_alliance
from app.game.engine import GameRuleError, basic_attack, create_state
from app.game.fixtures import DEFAULT_MAP, demo_entity
from app.game.victory import update_victory


def test_alliance_is_transitive_and_removable() -> None:
    a = demo_entity("a", "A", 0, 0, 1, speed=10)
    b = demo_entity("b", "B", 1, 0, 2, speed=8)
    c = demo_entity("c", "C", 2, 0, 3, speed=7)
    state = create_state(DEFAULT_MAP, [a, b, c])

    add_alliance(state, "a", "b")
    add_alliance(state, "b", "c")

    assert are_allies(state, a, c)
    assert len(set(alliance_groups(state).values())) == 1

    remove_alliance(state, "b", "c")
    assert not are_allies(state, a, c)


def test_allies_cannot_basic_attack_each_other() -> None:
    a = demo_entity("a", "A", 0, 0, 1, speed=10)
    b = demo_entity("b", "B", 1, 0, 2, speed=8)
    state = create_state(DEFAULT_MAP, [a, b])
    add_alliance(state, "a", "b")

    with pytest.raises(GameRuleError):
        basic_attack(state, "a", "b")


def test_victory_when_one_alliance_group_remains() -> None:
    a = demo_entity("a", "A", 0, 0, 1, speed=10)
    b = demo_entity("b", "B", 1, 0, 2, speed=8)
    state = create_state(DEFAULT_MAP, [a, b])
    add_alliance(state, "a", "b")

    assert update_victory(state)
    assert state.isFinished
    assert state.winnerGroup == ["a", "b"]
