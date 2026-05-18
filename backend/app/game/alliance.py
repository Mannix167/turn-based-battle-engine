from app.game.models import AllianceLink, BattleEntity, GameState


def alliance_group_id(entity: BattleEntity) -> str:
    return entity.ownerId or entity.id


def are_owner_allies(a: BattleEntity, b: BattleEntity) -> bool:
    if a.id == b.id:
        return True
    return alliance_group_id(a) == alliance_group_id(b)


def add_alliance(
    state: GameState,
    source_id: str,
    target_id: str,
    duration: int | None = None,
) -> None:
    if source_id == target_id:
        return
    if any(_same_link(link, source_id, target_id) for link in state.alliances):
        return
    state.alliances.append(AllianceLink(source_id, target_id, duration))


def remove_alliance(state: GameState, source_id: str, target_id: str | None = None) -> None:
    if target_id is None:
        state.alliances = [
            link for link in state.alliances if source_id not in {link.sourceEntityId, link.targetEntityId}
        ]
        return
    state.alliances = [link for link in state.alliances if not _same_link(link, source_id, target_id)]


def tick_temporary_alliances(state: GameState) -> None:
    kept: list[AllianceLink] = []
    for link in state.alliances:
        if link.remainingTurns is None:
            kept.append(link)
            continue
        link.remainingTurns -= 1
        if link.remainingTurns > 0:
            kept.append(link)
    state.alliances = kept


def are_allies(state: GameState, a: BattleEntity, b: BattleEntity) -> bool:
    if are_owner_allies(a, b):
        return True
    groups = alliance_groups(state)
    return groups.get(a.id) == groups.get(b.id)


def alliance_groups(state: GameState) -> dict[str, str]:
    alive_ids = [entity.id for entity in state.entities.values() if entity.isAlive and entity.type != "monster"]
    parent = {entity_id: entity_id for entity_id in alive_ids}

    def find(entity_id: str) -> str:
        while parent[entity_id] != entity_id:
            parent[entity_id] = parent[parent[entity_id]]
            entity_id = parent[entity_id]
        return entity_id

    def union(a_id: str, b_id: str) -> None:
        if a_id not in parent or b_id not in parent:
            return
        a_root = find(a_id)
        b_root = find(b_id)
        if a_root != b_root:
            parent[b_root] = a_root

    for entity in state.entities.values():
        if entity.isAlive and entity.ownerId and entity.ownerId in parent:
            union(entity.id, entity.ownerId)
    for link in state.alliances:
        union(link.sourceEntityId, link.targetEntityId)

    return {entity_id: find(entity_id) for entity_id in alive_ids}


def _same_link(link: AllianceLink, a_id: str, b_id: str) -> bool:
    return {link.sourceEntityId, link.targetEntityId} == {a_id, b_id}
