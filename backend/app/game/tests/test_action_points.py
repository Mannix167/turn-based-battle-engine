import pytest

from app.game.action_points import ActionPointError, begin_action, consume_ap, end_action
from app.game.fixtures import demo_entity


def test_begin_and_end_action_manage_temporary_ap() -> None:
    entity = demo_entity("a", "A", 0, 0, 1)

    begin_action(entity)
    assert entity.temporaryAP == entity.tempApPerTurn

    end_action(entity)
    assert entity.temporaryAP == 0
    assert entity.permanentAP == 3


def test_consumes_temporary_ap_before_permanent_ap() -> None:
    entity = demo_entity("a", "A", 0, 0, 1)
    entity.temporaryAP = 2
    entity.permanentAP = 3

    consume_ap(entity, 4)

    assert entity.temporaryAP == 0
    assert entity.permanentAP == 1


def test_cannot_overspend_ap() -> None:
    entity = demo_entity("a", "A", 0, 0, 1)

    with pytest.raises(ActionPointError):
        consume_ap(entity, 4)
