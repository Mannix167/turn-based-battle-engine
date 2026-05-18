import math
import random
from dataclasses import dataclass
from random import Random

from app.game.models import BattleEntity


@dataclass(frozen=True)
class DamageResult:
    amount: int
    isCrit: bool
    rawDamage: int


def roll_crit(attacker: BattleEntity, rng: Random | None = None) -> bool:
    roller = rng or random
    return roller.random() < attacker.critRate / 100


def calculate_damage(
    attacker: BattleEntity,
    target: BattleEntity,
    base_damage: int | None = None,
    rng: Random | None = None,
) -> DamageResult:
    raw = attacker.currentAttack if base_damage is None else base_damage
    crit = roll_crit(attacker, rng)
    if crit:
        raw = math.floor(raw * 1.5)
    amount = max(1, math.floor(raw - target.currentDefense))
    return DamageResult(amount=amount, isCrit=crit, rawDamage=raw)


def apply_damage(
    attacker: BattleEntity,
    target: BattleEntity,
    base_damage: int | None = None,
    rng: Random | None = None,
) -> DamageResult:
    if attacker.id == target.id:
        return DamageResult(amount=0, isCrit=False, rawDamage=0)
    result = calculate_damage(attacker, target, base_damage, rng)
    target.currentHp = max(0, target.currentHp - result.amount)
    if target.currentHp <= 0:
        target.isAlive = False
        target.statusEffects.clear()
    return result
