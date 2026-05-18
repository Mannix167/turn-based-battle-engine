from app.game.alliance import are_allies
from app.game.distance import manhattan
from app.game.map_system import is_valid_cell, occupied_entity_at, occupied_treasure_at
from app.game.models import BattleEntity, Direction, GameState, Position
from app.game.skills.skill_template import SkillTemplate


class TargetingError(ValueError):
    pass


def resolve_targets(
    state: GameState,
    caster: BattleEntity,
    template: SkillTemplate,
    target_id: str | None = None,
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
            or occupied_treasure_at(state, target_position)
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
) -> None:
    if not target.isAlive:
        raise TargetingError("Target must be alive")
    if manhattan(caster.position, target.position) > template.range:
        raise TargetingError("Target is out of skill range")
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
        if not is_valid_cell(state.gameMap, pos):
            continue
        entity = occupied_entity_at(state, pos)
        if entity and entity.isAlive and not are_allies(state, caster, entity):
            targets.append(entity)
    return targets
