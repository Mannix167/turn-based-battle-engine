from app.game.action_points import consume_ap
from app.game.distance import manhattan
from app.game.models import BattleEntity, GameMap, GameState, Position
from app.game.terrain import is_cell_enabled, is_walkable, movement_leave_cost


class MapRuleError(ValueError):
    pass


def is_valid_cell(game_map: GameMap, pos: Position) -> bool:
    in_bounds = 0 <= pos.x < game_map.width and 0 <= pos.y < game_map.height
    if not in_bounds:
        return False
    return is_cell_enabled(game_map, pos)


def occupied_entity_at(state: GameState, pos: Position) -> BattleEntity | None:
    for entity in state.entities.values():
        if entity.isAlive and entity.x == pos.x and entity.y == pos.y:
            return entity
    return None


def entity_at_or_error(state: GameState, entity_id: str) -> BattleEntity:
    entity = state.entities.get(entity_id)
    if not entity:
        raise MapRuleError("Entity not found")
    return entity


def occupied_treasure_at(state: GameState, pos: Position) -> bool:
    return any(not t.isDug and t.x == pos.x and t.y == pos.y for t in state.treasures.values())


def is_occupied(state: GameState, pos: Position) -> bool:
    return occupied_entity_at(state, pos) is not None


def assert_empty_valid_cell(state: GameState, pos: Position) -> None:
    if not is_valid_cell(state.gameMap, pos):
        raise MapRuleError("Target cell is outside the playable map")
    if not is_walkable(state.gameMap, pos):
        raise MapRuleError("Target cell terrain is not walkable")
    if is_occupied(state, pos):
        raise MapRuleError("Target cell is occupied")


def move_entity(state: GameState, entity_id: str, to: Position) -> None:
    entity = state.entities[entity_id]
    if not entity.isAlive:
        raise MapRuleError("Dead entities cannot move")
    distance = manhattan(entity.position, to)
    if distance < 1:
        raise MapRuleError("Move target must be different")
    if distance != 1:
        raise MapRuleError("Only orthogonal one-cell movement is supported")
    assert_empty_valid_cell(state, to)
    consume_ap(entity, movement_leave_cost(state.gameMap, entity.position))
    entity.x = to.x
    entity.y = to.y
    state.log.append(f"{entity.name} moved to ({to.x}, {to.y})")
