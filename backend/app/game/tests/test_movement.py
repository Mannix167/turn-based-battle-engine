import pytest

from app.game.action_points import begin_action
from app.game.fixtures import demo_entity
from app.game.map_system import MapRuleError, move_entity
from app.game.models import GameMap, GameState, Position, TreasureEntity


def make_state() -> GameState:
    return GameState(
        gameId="g",
        gameMap=GameMap(id="m", name="M", width=3, height=3, validCells={Position(0, 0), Position(1, 0)}),
        entities={
            "a": demo_entity("a", "A", 0, 0, 1),
            "b": demo_entity("b", "B", 1, 0, 2),
        },
    )


def test_move_one_cell_consumes_ap() -> None:
    state = GameState(
        gameId="g",
        gameMap=GameMap(id="m", name="M", width=3, height=3),
        entities={"a": demo_entity("a", "A", 0, 0, 1)},
    )
    begin_action(state.entities["a"])

    move_entity(state, "a", Position(0, 1))

    assert state.entities["a"].position == Position(0, 1)
    assert state.entities["a"].temporaryAP == 1


def test_cannot_move_to_invalid_cell() -> None:
    state = make_state()
    begin_action(state.entities["a"])

    with pytest.raises(MapRuleError):
        move_entity(state, "a", Position(0, 1))


def test_cannot_move_to_occupied_entity_but_can_share_treasure_cell() -> None:
    state = make_state()
    begin_action(state.entities["a"])
    with pytest.raises(MapRuleError):
        move_entity(state, "a", Position(1, 0))

    state.entities.pop("b")
    state.treasures["t"] = TreasureEntity(id="t", name="Treasure", x=1, y=0)
    move_entity(state, "a", Position(1, 0))
    assert state.entities["a"].position == Position(1, 0)
