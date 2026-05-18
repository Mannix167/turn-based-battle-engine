from random import Random

from app.game.damage import apply_damage, apply_damage_to_state, calculate_damage
from app.game.fixtures import demo_entity
from app.game.engine import create_state
from app.game.models import StatusEffect
from app.game.fixtures import DEFAULT_MAP


def test_damage_subtracts_defense_with_minimum_one() -> None:
    attacker = demo_entity("a", "A", 0, 0, 1)
    target = demo_entity("b", "B", 1, 0, 2)
    attacker.currentAttack = 4
    target.currentDefense = 10

    result = calculate_damage(attacker, target)

    assert result.amount == 1


def test_critical_hit_multiplies_raw_damage() -> None:
    attacker = demo_entity("a", "A", 0, 0, 1)
    target = demo_entity("b", "B", 1, 0, 2)
    attacker.critRate = 100
    attacker.currentAttack = 20
    target.currentDefense = 5

    result = calculate_damage(attacker, target, rng=Random(1))

    assert result.isCrit is True
    assert result.rawDamage == 30
    assert result.amount == 25


def test_self_damage_is_ignored() -> None:
    attacker = demo_entity("a", "A", 0, 0, 1)

    result = apply_damage(attacker, attacker)

    assert result.amount == 0
    assert attacker.currentHp == 100


def test_next_damage_multiplier_is_consumed() -> None:
    attacker = demo_entity("a", "A", 0, 0, 1)
    target = demo_entity("b", "B", 1, 0, 2)
    attacker.critRate = 0
    attacker.statusEffects.append(
        StatusEffect(
            id="burst",
            type="next_damage_multiplier",
            sourceEntityId="a",
            targetEntityId="a",
            value=2,
        )
    )
    state = create_state(DEFAULT_MAP, [attacker, target])

    result = apply_damage_to_state(state, attacker, target)

    assert result.amount == 35
    assert target.currentHp == 65
    assert attacker.statusEffects == []
