from app.game.alliance import are_allies
from app.game.distance import manhattan
from app.game.map_system import is_valid_cell, occupied_entity_at
from app.game.models import BattleEntity, Direction, GameState, Position
from app.game.skills.skill_template import SkillTemplate
from app.game.terrain import blocks_line_of_effect


class TargetingError(ValueError):
    pass


def resolve_targets(
    state: GameState,
    caster: BattleEntity,
    template: SkillTemplate,
    target_id: str | None = None,
    second_target_id: str | None = None,
    target_position: Position | None = None,
    direction: Direction | None = None,
) -> list[BattleEntity]:
    if template.targetType == "self":
        return [caster]
    if template.targetType == "single":
        if not target_id:
            raise TargetingError("Single-target skills require targetEntityId")
        target = state.entities[target_id]
        validate_entity_target(state, caster, target, template)
        return [target]
    if template.targetType == "twoEntities":
        if not target_id or not second_target_id:
            raise TargetingError("Two-target skills require targetEntityId and secondTargetEntityId")
        if target_id == second_target_id:
            raise TargetingError("Two-target skills require different targets")
        first = state.entities[target_id]
        second = state.entities[second_target_id]
        validate_entity_target(state, caster, first, template)
        validate_entity_target(state, caster, second, template)
        return [first, second]
    if template.targetType == "direction":
        if not direction:
            raise TargetingError("Directional skills require direction")
        return targets_in_line(state, caster, template, direction)
    if template.targetType == "emptyCell":
        if not target_position:
            raise TargetingError("Empty-cell skills require target position")
        if (
            not is_valid_cell(state.gameMap, target_position)
            or occupied_entity_at(state, target_position)
        ):
            raise TargetingError("Target cell must be an empty valid cell")
        if manhattan(caster.position, target_position) > template.range:
            raise TargetingError("Target cell is out of skill range")
        return []
    raise TargetingError("Unsupported target type")


def validate_entity_target(
    state: GameState,
    caster: BattleEntity,
    target: BattleEntity,
    template: SkillTemplate,
    *,
    check_range: bool = True,
) -> None:
    if not target.isAlive:
        raise TargetingError("Target must be alive")
    if check_range and manhattan(caster.position, target.position) > template.range:
        raise TargetingError("Target is out of skill range")
    if target.type == "monster" and not template.canTargetMonster:
        raise TargetingError("Skill cannot target monsters")
    if target.type == "summon" and not template.canTargetSummon:
        raise TargetingError("Skill cannot target summons")
    if caster.id == target.id and not template.canTargetSelf:
        raise TargetingError("Skill cannot target self")
    if caster.id != target.id and are_allies(state, caster, target) and not template.canTargetAlly:
        raise TargetingError("Skill cannot target allies")
    if caster.id != target.id and not are_allies(state, caster, target) and not template.canTargetEnemy:
        raise TargetingError("Skill cannot target enemies")


def targets_in_line(
    state: GameState,
    caster: BattleEntity,
    template: SkillTemplate,
    direction: Direction,
) -> list[BattleEntity]:
    dx, dy = {
        "up": (0, -1),
        "down": (0, 1),
        "left": (-1, 0),
        "right": (1, 0),
    }[direction]
    targets: list[BattleEntity] = []
    for step in range(1, template.range + 1):
        pos = Position(caster.x + dx * step, caster.y + dy * step)
        if not is_valid_cell(state.gameMap, pos) or blocks_line_of_effect(state.gameMap, pos):
            break
        entity = occupied_entity_at(state, pos)
        if entity and entity.isAlive:
            try:
                validate_entity_target(state, caster, entity, template)
            except TargetingError:
                continue
            targets.append(entity)
    return targets
