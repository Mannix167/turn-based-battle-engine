from app.game.action_points import begin_action, end_action
from app.game.alliance import tick_temporary_alliances
from app.game.models import BattleEntity, GameState
from app.game.status.status_engine import trigger_action_start_status
from app.game.terrain import tick_terrain_durations, trigger_action_start_terrain


class TurnQueueError(ValueError):
    pass


def is_queue_eligible(entity: BattleEntity, round_number: int) -> bool:
    return entity.isAlive and entity.type != "monster" and entity.activeRound <= round_number


def generate_round_queue(state: GameState) -> list[str]:
    entries: list[BattleEntity] = []
    for entity in state.entities.values():
        if not is_queue_eligible(entity, state.roundNumber):
            continue
        entries.extend([entity] * (1 + entity.extraTurnNextRound))
        entity.extraTurnNextRound = 0

    entries.sort(key=lambda e: (-e.speed, e.joinOrder))
    state.actionQueue = [entity.id for entity in entries]
    state.currentEntityId = None
    return state.actionQueue


def advance_to_next_actor(state: GameState) -> str | None:
    while state.actionQueue:
        entity_id = state.actionQueue.pop(0)
        entity = state.entities[entity_id]
        if not entity.isAlive:
            continue
        state.recentDamageEvents = []
        state.recentDamagedEntityIds = []
        state.recentEvents = []
        if trigger_action_start_terrain(state, entity):
            state.log.append(f"{entity.name} was defeated by terrain")
            continue
        if trigger_action_start_status(state, entity):
            end_action(entity)
            state.log.append(f"{entity.name} skips action")
            continue
        begin_action(entity)
        state.currentEntityId = entity_id
        state.log.append(f"{entity.name} begins action")
        return entity_id

    state.roundNumber += 1
    tick_temporary_alliances(state)
    tick_terrain_durations(state)
    generate_round_queue(state)
    if not state.actionQueue:
        state.currentEntityId = None
        return None
    return advance_to_next_actor(state)


def end_current_action(state: GameState, entity_id: str) -> None:
    if state.currentEntityId != entity_id:
        raise TurnQueueError("Only the current actor can end action")
    state.recentDamagedEntityIds = []
    state.recentDamageEvents = []
    end_action(state.entities[entity_id])
    state.log.append(f"{state.entities[entity_id].name} ends action")
    state.currentEntityId = None
    advance_to_next_actor(state)
