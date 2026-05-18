from random import Random

from app.game.action_points import consume_ap
from app.game.damage import apply_damage
from app.game.distance import manhattan
from app.game.models import GameState
from app.game.reward import grant_random_common_skill, handle_defeat


class TreasureError(ValueError):
    pass


def dig_treasure(
    state: GameState,
    entity_id: str,
    treasure_id: str,
    failure_damage: int = 10,
    rng: Random | None = None,
) -> None:
    entity = state.entities[entity_id]
    treasure = state.treasures.get(treasure_id)
    if not treasure:
        raise TreasureError("Treasure not found")
    if treasure.isDug:
        raise TreasureError("Treasure has already been dug")
    if manhattan(entity.position, treasure.position) > entity.attackRange:
        raise TreasureError("Treasure is out of digging range")

    consume_ap(entity, 1)
    treasure.isDug = True
    roller = rng or Random()
    if roller.random() < entity.luck / 100:
        grant_random_common_skill(entity, roller)
        state.log.append(f"{entity.name} dug {treasure.name} and found a skill")
        return
    if roller.random() < 0.5:
        result = apply_damage(entity, entity, base_damage=failure_damage)
        if result.amount == 0:
            entity.currentHp = max(0, entity.currentHp - failure_damage)
            if entity.currentHp <= 0:
                entity.isAlive = False
                handle_defeat(state, entity, None, roller)
        state.log.append(f"{entity.name} failed to dig {treasure.name} and took {failure_damage} damage")
    else:
        state.log.append(f"{entity.name} failed to dig {treasure.name}")
