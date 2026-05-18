import pytest

from app.game.engine import create_state, dig_treasure
from app.game.fixtures import DEFAULT_MAP, demo_entity
from app.game.models import GameState, TreasureEntity
from app.game.treasure import TreasureError


class SequenceRng:
    def __init__(self, values: list[float]) -> None:
        self.values = values

    def random(self) -> float:
        return self.values.pop(0)

    def choice(self, values: list[str]) -> str:
        return values[0]


def add_treasure(state: GameState) -> None:
    state.treasures["t1"] = TreasureEntity(id="t1", name="Cache", x=1, y=0)


def test_successful_treasure_dig_consumes_ap_and_grants_skill() -> None:
    digger = demo_entity("a", "A", 0, 0, 1, speed=10)
    digger.luck = 100
    digger.skillInstances.clear()
    state = create_state(DEFAULT_MAP, [digger])
    add_treasure(state)

    dig_treasure(state, "a", "t1", rng=SequenceRng([0.0]))

    assert state.treasures["t1"].isDug
    assert digger.temporaryAP == 1
    assert [skill.templateId for skill in digger.skillInstances] == ["bomb"]


def test_treasure_can_only_be_dug_once() -> None:
    digger = demo_entity("a", "A", 0, 0, 1, speed=10)
    digger.luck = 100
    state = create_state(DEFAULT_MAP, [digger])
    add_treasure(state)

    dig_treasure(state, "a", "t1", rng=SequenceRng([0.0]))

    with pytest.raises(TreasureError):
        dig_treasure(state, "a", "t1", rng=SequenceRng([0.0]))


def test_failed_treasure_dig_can_apply_penalty_damage() -> None:
    digger = demo_entity("a", "A", 0, 0, 1, speed=10)
    digger.luck = 0
    state = create_state(DEFAULT_MAP, [digger])
    add_treasure(state)

    dig_treasure(state, "a", "t1", failure_damage=10, rng=SequenceRng([0.9, 0.1]))

    assert digger.currentHp == 90
    assert state.treasures["t1"].isDug
