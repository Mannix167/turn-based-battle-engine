from app.game.damage import apply_damage
from app.game.models import BattleEntity, GameState, StatusEffect


def trigger_action_start_status(state: GameState, entity: BattleEntity) -> bool:
    """Returns True when the entity's action should be skipped."""
    skip_action = False
    kept: list[StatusEffect] = []
    expired_stat_modifiers: list[StatusEffect] = []

    for status in entity.statusEffects:
        if status.type == "stun":
            skip_action = True
            continue
        if status.type == "burn":
            amount = status.value or 0
            if amount > 0:
                entity.currentHp = max(0, entity.currentHp - amount)
                state.log.append(f"{entity.name} took {amount} burn damage")
                if entity.currentHp <= 0:
                    entity.isAlive = False
                    entity.statusEffects.clear()
                    return True
        if status.type == "delayed_damage":
            status.remainingTurns = (status.remainingTurns or 1) - 1
            if status.remainingTurns <= 0:
                source = state.entities.get(status.sourceEntityId, entity)
                result = apply_damage(source, entity, base_damage=status.value or 0)
                state.log.append(f"{entity.name} took {result.amount} delayed damage")
                continue
        if status.type == "stat_modifier":
            status.remainingTurns = (status.remainingTurns or 1) - 1
            if status.remainingTurns <= 0:
                expired_stat_modifiers.append(status)
                continue
        if status.type in {"burn"} and status.remainingTurns is not None:
            status.remainingTurns -= 1
            if status.remainingTurns <= 0:
                continue
        kept.append(status)

    entity.statusEffects = kept
    for status in expired_stat_modifiers:
        _revert_stat_modifier(entity, status)
    return skip_action


def _revert_stat_modifier(entity: BattleEntity, status: StatusEffect) -> None:
    stat = status.metadata.get("stat")
    value = -(status.value or 0)
    field_name = {
        "attack": "currentAttack",
        "defense": "currentDefense",
        "speed": "speed",
        "luck": "luck",
        "critRate": "critRate",
    }.get(stat)
    if field_name:
        setattr(entity, field_name, getattr(entity, field_name) + value)
