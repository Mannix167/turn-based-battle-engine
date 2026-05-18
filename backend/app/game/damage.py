import math
import random
from dataclasses import dataclass
from random import Random

from app.game.models import BattleEntity, DamageEvent, GameState


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


def apply_damage_to_state(
    state: GameState,
    attacker: BattleEntity,
    target: BattleEntity,
    base_damage: int | None = None,
    rng: Random | None = None,
) -> DamageResult:
    if attacker.id == target.id:
        return DamageResult(amount=0, isCrit=False, rawDamage=0)
    next_damage_status = next(
        (status for status in attacker.statusEffects if status.type == "next_damage_multiplier"),
        None,
    )
    if next_damage_status:
        multiplier = next_damage_status.value or next_damage_status.metadata.get("multiplier") or 1
        raw_base = attacker.currentAttack if base_damage is None else base_damage
        base_damage = max(0, int(raw_base * float(multiplier)))
        attacker.statusEffects = [
            status for status in attacker.statusEffects if status.id != next_damage_status.id
        ]
    result = calculate_damage(attacker, target, base_damage, rng)
    actual_amount = apply_hp_loss_to_state(
        state,
        attacker,
        target,
        result.amount,
        is_crit=result.isCrit,
        raw_damage=result.rawDamage,
    )
    return DamageResult(amount=actual_amount, isCrit=result.isCrit, rawDamage=result.rawDamage)


def apply_fixed_damage_to_state(
    state: GameState,
    source: BattleEntity,
    target: BattleEntity,
    amount: int,
    *,
    allow_self: bool = False,
) -> int:
    if source.id == target.id and not allow_self:
        return 0
    return apply_hp_loss_to_state(state, source, target, amount, raw_damage=amount)


def apply_hp_loss_to_state(
    state: GameState,
    source: BattleEntity,
    target: BattleEntity,
    amount: int,
    *,
    is_crit: bool = False,
    raw_damage: int | None = None,
    sync_links: bool = True,
    linked_from_entity_id: str | None = None,
) -> int:
    if amount <= 0 or not target.isAlive:
        return 0
    actual_amount = min(target.currentHp, amount)
    target.currentHp = max(0, target.currentHp - actual_amount)
    if target.currentHp <= 0:
        target.isAlive = False
        target.statusEffects.clear()
    if actual_amount > 0:
        state.recentDamagedEntityIds.append(target.id)
        state.recentDamageEvents.append(
            DamageEvent(
                sourceEntityId=source.id,
                targetEntityId=target.id,
                amount=actual_amount,
                isCrit=is_crit,
                rawDamage=raw_damage if raw_damage is not None else amount,
                linkedFromEntityId=linked_from_entity_id,
            )
        )
        if sync_links:
            apply_damage_sync_links(state, source, target, actual_amount)
    return actual_amount


def apply_damage_sync_links(
    state: GameState,
    source: BattleEntity,
    damaged: BattleEntity,
    amount: int,
) -> None:
    linked_ids = [
        status.metadata.get("linkedEntityId")
        for status in damaged.statusEffects
        if status.type == "damage_sync_link" and status.metadata.get("linkedEntityId")
    ]
    for linked_id in dict.fromkeys(linked_ids):
        linked = state.entities.get(str(linked_id))
        if not linked or not linked.isAlive or linked.id == damaged.id:
            continue
        apply_hp_loss_to_state(
            state,
            source,
            linked,
            amount,
            raw_damage=amount,
            sync_links=False,
            linked_from_entity_id=damaged.id,
        )
