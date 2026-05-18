import pytest

from app.game.engine import GameRuleError, basic_attack, create_state
from app.game.fixtures import DEFAULT_MAP, demo_entity


def test_basic_attack_consumes_ap_and_deals_damage() -> None:
    attacker = demo_entity("a", "A", 0, 0, 1, speed=10)
    target = demo_entity("b", "B", 1, 0, 2, speed=8)
    state = create_state(DEFAULT_MAP, [attacker, target])

    basic_attack(state, "a", "b")

    assert attacker.temporaryAP == 1
    assert target.currentHp == 85


def test_basic_attack_rejects_self_ally_and_out_of_range() -> None:
    attacker = demo_entity("a", "A", 0, 0, 1, speed=10)
    target = demo_entity("b", "B", 3, 0, 2, speed=8)
    ally = demo_entity("c", "C", 0, 1, 3, speed=7)
    ally.ownerId = "a"
    attacker.ownerId = "a"
    state = create_state(DEFAULT_MAP, [attacker, target, ally])

    with pytest.raises(GameRuleError):
        basic_attack(state, "a", "a")
    with pytest.raises(GameRuleError):
        basic_attack(state, "a", "c")
    with pytest.raises(GameRuleError):
        basic_attack(state, "a", "b")
