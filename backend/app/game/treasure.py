from random import Random

from app.game.action_points import consume_ap
from app.game.damage import apply_fixed_damage_to_state
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
    state.recentDamagedEntityIds = []
    state.recentDamageEvents = []
    treasure.isDug = True
    roller = rng or Random()
    if roller.random() < entity.luck / 100:
        skill = grant_random_common_skill(entity, roller, state.rewardSkillPoolTemplateIds)
        if skill:
            state.log.append(f"{entity.name} dug {treasure.name} and found a skill")
        else:
            state.log.append(f"{entity.name} dug {treasure.name}, but the reward pool is empty")
        return
    if roller.random() < 0.5:
        actual = apply_fixed_damage_to_state(state, entity, entity, failure_damage, allow_self=True)
        if not entity.isAlive:
            handle_defeat(state, entity, None, roller)
        state.log.append(f"{entity.name} failed to dig {treasure.name} and took {actual} damage")
    else:
        state.log.append(f"{entity.name} failed to dig {treasure.name}")
