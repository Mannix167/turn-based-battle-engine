from app.game.alliance import alliance_groups
from app.game.models import GameState


def update_victory(state: GameState) -> bool:
    character_ids = [
        entity.id
        for entity in state.entities.values()
        if entity.isAlive and entity.type == "character"
    ]
    all_groups = alliance_groups(state)
    groups = {entity_id: all_groups[entity_id] for entity_id in character_ids if entity_id in all_groups}
    unique_groups = set(groups.values())
    if len(unique_groups) == 1 and groups:
        state.isFinished = True
        winning_group = next(iter(unique_groups))
        state.winnerGroup = sorted(entity_id for entity_id, group in groups.items() if group == winning_group)
        state.log.append(f"Game finished. Winner group: {', '.join(state.winnerGroup)}")
        return True
    state.isFinished = False
    state.winnerGroup = []
    return False
