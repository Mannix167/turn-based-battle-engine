from app.game.damage import apply_damage_to_state, apply_fixed_damage_to_state
from app.game.distance import manhattan
from app.game.alliance import are_allies
from app.game.models import BattleEntity, GameState, StatusEffect


def trigger_action_start_status(state: GameState, entity: BattleEntity) -> bool:
    """Returns True when the entity's action should be skipped."""
    skip_action = False
    state.recentDamageEvents = []
    state.recentDamagedEntityIds = []
    kept: list[StatusEffect] = []
    expired_stat_modifiers: list[StatusEffect] = []

    for status in entity.statusEffects:
        if status.type == "stun":
            skip_action = True
            continue
        if status.type == "burn":
            amount = status.value or 0
            if amount > 0:
                source = state.entities.get(status.sourceEntityId, entity)
                actual = apply_fixed_damage_to_state(state, source, entity, amount, allow_self=True)
                state.log.append(f"{entity.name} took {actual} burn damage")
                if not entity.isAlive:
                    return True
        if status.type == "delayed_damage":
            status.remainingTurns = (status.remainingTurns or 1) - 1
            if status.remainingTurns <= 0:
                source = state.entities.get(status.sourceEntityId, entity)
                result = apply_damage_to_state(state, source, entity, base_damage=status.value or 0)
                state.log.append(f"{entity.name} took {result.amount} delayed damage")
                continue
        if status.type == "delayed_area_damage":
            status.remainingTurns = (status.remainingTurns or 1) - 1
            if status.remainingTurns <= 0:
                trigger_delayed_area_damage(state, status)
                continue
        if status.type == "stat_modifier":
            status.remainingTurns = (status.remainingTurns or 1) - 1
            if status.remainingTurns <= 0:
                expired_stat_modifiers.append(status)
                continue
        if status.type in {"burn", "silence", "root", "damage_sync_link", "next_damage_multiplier", "adrenaline"} and status.remainingTurns is not None:
            status.remainingTurns -= 1
            if status.remainingTurns <= 0:
                continue
        kept.append(status)

    entity.statusEffects = kept
    for status in expired_stat_modifiers:
        _revert_stat_modifier(entity, status)
    return skip_action


def trigger_delayed_area_damage(state: GameState, status: StatusEffect) -> None:
    center_x = status.metadata.get("x")
    center_y = status.metadata.get("y")
    if center_x is None or center_y is None:
        return
    source = state.entities.get(status.sourceEntityId)
    if source is None:
        return
    area_type = status.metadata.get("areaType", "square")
    radius = max(1, int(status.metadata.get("areaSize", 3)) // 2)
    for target in state.entities.values():
        if not target.isAlive or target.id == source.id or are_allies(state, source, target):
            continue
        dx = abs(target.x - center_x)
        dy = abs(target.y - center_y)
        in_area = area_type == "square" and dx <= radius and dy <= radius
        if area_type == "circle":
            in_area = abs(target.x - center_x) + abs(target.y - center_y) <= radius
        if in_area:
            result = apply_damage_to_state(state, source, target, base_damage=status.value or 0)
            state.log.append(f"{target.name} took {result.amount} delayed area damage")


def _revert_stat_modifier(entity: BattleEntity, status: StatusEffect) -> None:
    stat = status.metadata.get("stat")
    value = -(status.value or 0)
    field_name = {
        "attack": "currentAttack",
        "baseAttack": "currentAttack",
        "defense": "currentDefense",
        "baseDefense": "currentDefense",
        "speed": "speed",
        "luck": "luck",
        "critRate": "critRate",
        "temporaryApPerTurn": "tempApPerTurn",
    }.get(stat)
    if field_name:
        setattr(entity, field_name, getattr(entity, field_name) + value)
        _clamp_entity_stats(entity)


def _clamp_entity_stats(entity: BattleEntity) -> None:
    entity.maxHp = max(1, entity.maxHp)
    entity.currentHp = max(0, min(entity.currentHp, entity.maxHp))
    entity.currentAttack = max(1, entity.currentAttack)
    entity.currentDefense = max(0, entity.currentDefense)
    entity.attackRange = max(1, entity.attackRange)
    entity.tempApPerTurn = max(0, entity.tempApPerTurn)
    entity.speed = max(0, entity.speed)
    entity.critRate = min(100, max(0, entity.critRate))
    entity.luck = min(100, max(0, entity.luck))
