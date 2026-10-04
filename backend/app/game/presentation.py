"""Presentation-only timelines. Combat is already settled before these are built.

Offsets are milliseconds relative to client playback start; timestamp is never
used as an animation clock. HP checkpoints are authoritative replay values.
"""
from uuid import uuid4

from app.game.models import BattlePlayback, GameState, PlaybackCue


def snapshot_entities(state: GameState) -> dict[str, tuple[int, bool]]:
    return {entity.id: (entity.currentHp, entity.isAlive) for entity in state.entities.values()}


def attach_bomb_playback(
    state: GameState, caster_id: str, before: dict[str, tuple[int, bool]]
) -> None:
    cast = next((event for event in state.recentEvents
                 if event.type == "skill_cast" and event.skillTemplateId == "bomb"), None)
    if not cast or not cast.sourcePosition or not cast.targetPosition:
        return
    distance = abs(cast.sourcePosition.x - cast.targetPosition.x) + abs(cast.sourcePosition.y - cast.targetPosition.y)
    launch_ms = 280
    impact_ms = launch_ms + min(760, 540 + distance * 45)
    cues = [
        PlaybackCue(0, "cast", entityId=caster_id),
        PlaybackCue(launch_ms, "launch", entityId=caster_id),
        PlaybackCue(impact_ms, "impact"),
    ]
    hp = {entity_id: item[0] for entity_id, item in before.items()}
    last_hit: dict[str, int] = {}
    hit_ms = impact_ms + 35
    counter_sources: set[str] = set()
    # Damage events include direct hits, linked damage and the resulting counters.
    # Replay their recorded amounts; no damage/crit/AP rule is recalculated here.
    for event in state.recentDamageEvents:
        if event.sourceEntityId != caster_id and event.sourceEntityId not in counter_sources:
            counter_sources.add(event.sourceEntityId)
            hit_ms += 380
            source = state.entities.get(event.sourceEntityId)
            target = state.entities.get(event.targetEntityId)
            cues.append(PlaybackCue(
                hit_ms - 120, "counter", entityId=event.sourceEntityId,
                sourcePosition=source.position if source else None,
                targetPosition=target.position if target else None,
            ))
        target_id = event.targetEntityId
        hp[target_id] = max(0, hp.get(target_id, 0) - event.amount)
        cues.append(PlaybackCue(
            hit_ms, "damage", entityId=target_id, sourceEntityId=event.sourceEntityId,
            amount=event.amount, hpAfter=hp[target_id], isCrit=event.isCrit,
        ))
        last_hit[target_id] = hit_ms
    for entity in state.entities.values():
        if before.get(entity.id, (0, False))[1] and not entity.isAlive:
            cues.append(PlaybackCue(
                last_hit.get(entity.id, hit_ms) + 300, "death",
                entityId=entity.id, hpAfter=0,
            ))
    cues.sort(key=lambda cue: cue.atMs)
    cast.playback = BattlePlayback(
        id=f"playback_{uuid4().hex[:12]}", visualKey="bomb", actorId=caster_id,
        sourcePosition=cast.sourcePosition, targetPosition=cast.targetPosition,
        durationMs=max(impact_ms + 1000, cues[-1].atMs + 650), cues=cues,
    )
