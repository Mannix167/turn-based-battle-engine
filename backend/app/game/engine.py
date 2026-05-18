from random import Random
from uuid import uuid4

from app.game.action_points import consume_ap
from app.game.alliance import are_allies
from app.game.damage import apply_damage_to_state
from app.game.distance import manhattan
from app.game.map_system import move_entity
from app.game.models import BattleEntity, GameMap, GameState, Position
from app.game.reward import choose_kill_reward as choose_reward_core
from app.game.reward import handle_defeat
from app.game.skills.effect_engine import use_skill as use_skill_core
from app.game.skills.skill_template import SkillTemplate
from app.game.treasure import dig_treasure as dig_treasure_core
from app.game.turn_queue import advance_to_next_actor, generate_round_queue
from app.game.victory import update_victory


class GameRuleError(ValueError):
    pass


def create_state(game_map: GameMap, entities: list[BattleEntity]) -> GameState:
    state = GameState(
        gameId=f"game_{uuid4().hex[:12]}",
        gameMap=game_map,
        entities={entity.id: entity for entity in entities},
    )
    generate_round_queue(state)
    advance_to_next_actor(state)
    return state


def move(state: GameState, entity_id: str, to: Position) -> GameState:
    assert_current_actor(state, entity_id)
    if has_status(state.entities[entity_id], "root"):
        raise GameRuleError("Entity is rooted and cannot move")
    state.recentDamagedEntityIds = []
    state.recentDamageEvents = []
    move_entity(state, entity_id, to)
    return state


def basic_attack(
    state: GameState,
    attacker_id: str,
    target_id: str,
    rng: Random | None = None,
) -> GameState:
    assert_current_actor(state, attacker_id)
    attacker = state.entities[attacker_id]
    target = state.entities[target_id]
    if not attacker.isAlive or not target.isAlive:
        raise GameRuleError("Attacker and target must be alive")
    if attacker.id == target.id:
        raise GameRuleError("Cannot basic-attack yourself")
    if are_allies(state, attacker, target):
        raise GameRuleError("Cannot basic-attack an ally")
    if manhattan(attacker.position, target.position) > attacker.attackRange:
        raise GameRuleError("Target is out of attack range")

    state.recentDamagedEntityIds = []
    state.recentDamageEvents = []
    consume_ap(attacker, 1)
    result = apply_damage_to_state(state, attacker, target, rng=rng)
    crit_text = " crit" if result.isCrit else ""
    state.log.append(f"{attacker.name} attacked {target.name} for {result.amount}{crit_text}")
    process_recent_defeats_and_counters(state, attacker_id)
    update_victory(state)
    return state


def use_skill(
    state: GameState,
    caster_id: str,
    skill_instance_id: str,
    template: SkillTemplate,
    target_id: str | None = None,
    second_target_id: str | None = None,
    target_position: Position | None = None,
    direction: str | None = None,
) -> GameState:
    assert_current_actor(state, caster_id)
    if has_status(state.entities[caster_id], "silence"):
        raise GameRuleError("Entity is silenced and cannot use skills")
    use_skill_core(
        state,
        caster_id,
        skill_instance_id,
        template,
        target_id=target_id,
        second_target_id=second_target_id,
        target_position=target_position,
        direction=direction,
    )
    process_recent_defeats_and_counters(state, caster_id)
    update_victory(state)
    return state


def has_status(entity: BattleEntity, status_type: str) -> bool:
    return any(status.type == status_type for status in entity.statusEffects)


def dig_treasure(
    state: GameState,
    entity_id: str,
    treasure_id: str,
    failure_damage: int = 10,
    rng: Random | None = None,
) -> GameState:
    assert_current_actor(state, entity_id)
    dig_treasure_core(state, entity_id, treasure_id, failure_damage, rng)
    update_victory(state)
    return state


def choose_kill_reward(state: GameState, killer_id: str, template_id: str) -> GameState:
    choose_reward_core(state, killer_id, template_id)
    return state


def counterattack_if_needed(
    state: GameState,
    monster: BattleEntity,
    attacker: BattleEntity,
    rng: Random | None = None,
) -> None:
    if not monster.isAlive or not attacker.isAlive:
        return
    if manhattan(monster.position, attacker.position) > monster.attackRange:
        return
    result = apply_damage_to_state(state, monster, attacker, rng=rng)
    state.log.append(f"{monster.name} counterattacked {attacker.name} for {result.amount}")
    if not attacker.isAlive:
        handle_defeat(state, attacker, monster, rng)


def process_recent_defeats_and_counters(state: GameState, source_id: str) -> None:
    source = state.entities[source_id]
    linked_damage_ids = {
        event.targetEntityId
        for event in state.recentDamageEvents
        if event.linkedFromEntityId is not None
    }
    for target_id in list(dict.fromkeys(state.recentDamagedEntityIds)):
        target = state.entities[target_id]
        if target.id == source_id:
            continue
        if not target.isAlive:
            state.log.append(f"{target.name} died")
            handle_defeat(state, target, source)
        elif target.type == "monster" and target.id not in linked_damage_ids:
            counterattack_if_needed(state, target, source)
    state.recentDamagedEntityIds = []


def assert_current_actor(state: GameState, entity_id: str) -> None:
    if state.currentEntityId != entity_id:
        raise GameRuleError("It is not this entity's action")
