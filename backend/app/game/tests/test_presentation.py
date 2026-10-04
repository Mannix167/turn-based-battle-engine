from dataclasses import asdict, replace

import pytest

from app.game.engine import create_state, use_skill
from app.game.fixtures import SKILL_TEMPLATES, demo_entity
from app.game.models import GameMap, Position
from app.game.skills.targeting import TargetingError
from app.schemas.game import BattleEventSchema


def make_battle(monster=False, hp=100):
    caster = demo_entity("a", "Caster", 1, 1, 1, speed=20)
    target = demo_entity("b", "Target", 3, 1, 2, speed=8)
    caster.critRate = target.critRate = 0
    caster.baseDefense = caster.currentDefense = 0
    target.baseDefense = target.currentDefense = 0
    target.currentHp = hp
    if monster:
        target.type = "monster"
        target.attackRange = 3
    state = create_state(GameMap("test", "Test", 8, 8), [caster, target])
    return state, caster, target


def timeline(state):
    cast = next(event for event in state.recentEvents if event.type == "skill_cast")
    assert cast.playback is not None
    wire = BattleEventSchema.model_validate(asdict(cast))
    assert wire.playback.id == cast.playback.id
    return cast.playback


def test_bomb_timeline_preserves_combat_and_places_damage_after_impact():
    state, caster, target = make_battle()
    use_skill(state, "a", "a_bomb_1", SKILL_TEMPLATES["bomb"], target_id="b")
    plan = timeline(state)
    assert target.currentHp == 85
    assert caster.temporaryAP == 1 and not caster.skillInstances
    assert plan.sourcePosition == Position(1, 1)
    assert plan.targetPosition == Position(3, 1)
    impact = next(cue.atMs for cue in plan.cues if cue.kind == "impact")
    damage = next(cue for cue in plan.cues if cue.kind == "damage")
    assert damage.atMs > impact
    assert damage.amount == 15 and damage.hpAfter == target.currentHp
    assert [cue.atMs for cue in plan.cues] == sorted(cue.atMs for cue in plan.cues)
    assert plan.durationMs > plan.cues[-1].atMs


def test_counter_is_presented_after_bomb_damage():
    state, caster, target = make_battle(monster=True)
    use_skill(state, "a", "a_bomb_1", SKILL_TEMPLATES["bomb"], target_id="b")
    cues = timeline(state).cues
    damage = [cue for cue in cues if cue.kind == "damage"]
    counter = next(cue for cue in cues if cue.kind == "counter")
    assert len(damage) == 2
    assert damage[0].atMs < counter.atMs < damage[1].atMs
    assert damage[0].hpAfter == target.currentHp
    assert damage[1].hpAfter == caster.currentHp


def test_lethal_bomb_records_death_after_hit_and_no_counter():
    state, _, target = make_battle(monster=True, hp=8)
    use_skill(state, "a", "a_bomb_1", SKILL_TEMPLATES["bomb"], target_id="b")
    cues = timeline(state).cues
    damage = next(cue for cue in cues if cue.kind == "damage")
    death = next(cue for cue in cues if cue.kind == "death")
    assert not target.isAlive and damage.amount == 8 and damage.hpAfter == 0
    assert death.atMs > damage.atMs and death.entityId == "b"
    assert not any(cue.kind == "counter" for cue in cues)


def test_illegal_cast_does_not_consume_or_schedule():
    state, caster, target = make_battle()
    target.x = target.y = 7
    with pytest.raises(TargetingError):
        use_skill(state, "a", "a_bomb_1", SKILL_TEMPLATES["bomb"], target_id="b")
    assert caster.temporaryAP == 2 and caster.skillInstances[0].quantity == 1
    assert not any(event.playback for event in state.recentEvents)


def test_other_skills_keep_existing_event_contract():
    state, caster, _ = make_battle()
    caster.skillInstances[0].templateId = "other"
    use_skill(state, "a", "a_bomb_1", replace(SKILL_TEMPLATES["bomb"], id="other"), target_id="b")
    assert not any(event.playback for event in state.recentEvents)