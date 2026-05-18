from app.game.models import BattleEntity


class ActionPointError(ValueError):
    pass


def total_ap(entity: BattleEntity) -> int:
    return entity.temporaryAP + entity.permanentAP


def begin_action(entity: BattleEntity) -> None:
    entity.temporaryAP = entity.tempApPerTurn


def end_action(entity: BattleEntity) -> None:
    entity.temporaryAP = 0


def consume_ap(entity: BattleEntity, cost: int) -> None:
    if cost < 0:
        raise ActionPointError("AP cost cannot be negative")
    if total_ap(entity) < cost:
        raise ActionPointError("Not enough action points")

    from_temporary = min(entity.temporaryAP, cost)
    entity.temporaryAP -= from_temporary
    entity.permanentAP -= cost - from_temporary
