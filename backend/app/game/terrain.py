from dataclasses import dataclass
from random import Random
from time import time
from uuid import uuid4

from app.game.damage import apply_hp_loss_to_state
from app.game.models import BattleEntity, BattleEvent, GameMap, GameState, MapCell, Position, TerrainState, TerrainType


@dataclass(frozen=True)
class TerrainEffectConfig:
    type: str
    value: int
    damageType: str = "true"


@dataclass(frozen=True)
class DestructibleTerrainConfig:
    hp: int
    defense: int
    afterDestroyedTerrainType: TerrainType


@dataclass(frozen=True)
class TerrainDefinition:
    type: TerrainType
    name: str
    description: str
    walkable: bool
    blocksLineOfEffect: bool
    blocksPlacement: bool
    blocksRandomSpawn: bool
    enterCost: int
    leaveCost: int
    onTurnStartEffect: TerrainEffectConfig | None = None
    destructible: DestructibleTerrainConfig | None = None
    tileImageUrl: str | None = None


TERRAIN_DEFINITIONS: dict[TerrainType, TerrainDefinition] = {
    "normal": TerrainDefinition("normal", "普通地形", "普通可行走地形。", True, False, False, False, 1, 1),
    "obstacle": TerrainDefinition("obstacle", "障碍物", "不可进入，阻挡直线技能。", False, True, True, True, 999999, 999999),
    "lava": TerrainDefinition(
        "lava",
        "岩浆",
        "回合开始时受到 5 点真实伤害。",
        True,
        False,
        False,
        False,
        1,
        1,
        TerrainEffectConfig("terrain_damage", 5),
    ),
    "swamp": TerrainDefinition("swamp", "沼泽", "从沼泽离开需要 2 行动点。", True, False, False, False, 1, 2),
    "wood_stake": TerrainDefinition(
        "wood_stake",
        "木桩",
        "不可进入，可被攻击，拥有 10 点生命值，摧毁后变为普通地形。",
        False,
        True,
        True,
        True,
        999999,
        999999,
        destructible=DestructibleTerrainConfig(10, 0, "normal"),
    ),
    "ice": TerrainDefinition("ice", "冰面", "从冰面离开不消耗行动点。", True, False, False, False, 0, 0),
    "thunderstorm": TerrainDefinition(
        "thunderstorm",
        "雷暴",
        "回合开始时，根据幸运值概率受到 30 点真实伤害。",
        True,
        False,
        False,
        False,
        1,
        1,
        TerrainEffectConfig("luck_based_damage", 30),
    ),
}


def terrain_definition(terrain_type: TerrainType) -> TerrainDefinition:
    return TERRAIN_DEFINITIONS[terrain_type]


def normalize_map_cells(game_map: GameMap) -> None:
    for y in range(game_map.height):
        for x in range(game_map.width):
            pos = Position(x, y)
            if pos not in game_map.cells:
                enabled = not game_map.validCells or pos in game_map.validCells
                game_map.cells[pos] = MapCell(x=x, y=y, enabled=enabled)
            ensure_cell_runtime_state(game_map.cells[pos])


def get_cell(game_map: GameMap, pos: Position) -> MapCell | None:
    normalize_map_cells(game_map)
    return game_map.cells.get(pos)


def is_cell_enabled(game_map: GameMap, pos: Position) -> bool:
    cell = get_cell(game_map, pos)
    return bool(cell and cell.enabled)


def is_walkable(game_map: GameMap, pos: Position) -> bool:
    cell = get_cell(game_map, pos)
    return bool(cell and cell.enabled and terrain_definition(cell.terrainType).walkable)


def blocks_placement(game_map: GameMap, pos: Position) -> bool:
    cell = get_cell(game_map, pos)
    return not cell or not cell.enabled or terrain_definition(cell.terrainType).blocksPlacement


def blocks_random_spawn(game_map: GameMap, pos: Position) -> bool:
    cell = get_cell(game_map, pos)
    return not cell or not cell.enabled or terrain_definition(cell.terrainType).blocksRandomSpawn


def blocks_line_of_effect(game_map: GameMap, pos: Position) -> bool:
    cell = get_cell(game_map, pos)
    return not cell or not cell.enabled or terrain_definition(cell.terrainType).blocksLineOfEffect


def movement_leave_cost(game_map: GameMap, pos: Position) -> int:
    cell = get_cell(game_map, pos)
    if not cell:
        return 1
    return terrain_definition(cell.terrainType).leaveCost


def ensure_cell_runtime_state(cell: MapCell) -> None:
    definition = terrain_definition(cell.terrainType)
    if definition.destructible and cell.terrainState is None:
        cell.terrainState = TerrainState(
            hp=definition.destructible.hp,
            maxHp=definition.destructible.hp,
            defense=definition.destructible.defense,
        )
    if not definition.destructible and cell.terrainState and cell.terrainState.hp is not None:
        cell.terrainState = None


def change_terrain(
    state: GameState,
    pos: Position,
    terrain_type: TerrainType,
    *,
    duration: int | str | None = None,
    created_by_skill_id: str | None = None,
    created_by_entity_id: str | None = None,
) -> None:
    cell = get_cell(state.gameMap, pos)
    if not cell or not cell.enabled:
        return
    old = cell.terrainType
    if old == terrain_type:
        ensure_cell_runtime_state(cell)
        return
    cell.terrainType = terrain_type
    cell.terrainState = None
    definition = terrain_definition(terrain_type)
    if definition.destructible:
        cell.terrainState = TerrainState(
            originalTerrainType=old,
            duration=duration,  # type: ignore[arg-type]
            createdBySkillId=created_by_skill_id,
            createdByEntityId=created_by_entity_id,
            hp=definition.destructible.hp,
            maxHp=definition.destructible.hp,
            defense=definition.destructible.defense,
        )
    elif duration is not None:
        cell.terrainState = TerrainState(
            originalTerrainType=old,
            duration=duration,  # type: ignore[arg-type]
            createdBySkillId=created_by_skill_id,
            createdByEntityId=created_by_entity_id,
        )
    state.recentEvents.append(
        BattleEvent(
            id=f"event_{uuid4().hex[:10]}",
            type="terrain_changed",
            timestamp=time(),
            actorId=created_by_entity_id,
            targetPosition=pos,
            oldTerrainType=old,
            newTerrainType=terrain_type,
            visualKey=f"terrain-{terrain_type}",
        )
    )
    state.log.append(f"Terrain at ({pos.x}, {pos.y}) changed from {old} to {terrain_type}")


def damage_destructible_terrain(
    state: GameState,
    attacker: BattleEntity,
    pos: Position,
    raw_damage: int,
) -> int:
    cell = get_cell(state.gameMap, pos)
    if not cell or cell.terrainType != "wood_stake":
        raise ValueError("Target terrain is not destructible")
    ensure_cell_runtime_state(cell)
    defense = cell.terrainState.defense if cell.terrainState and cell.terrainState.defense is not None else 0
    amount = max(1, raw_damage - defense)
    hp = max(0, (cell.terrainState.hp if cell.terrainState and cell.terrainState.hp is not None else 10) - amount)
    if cell.terrainState:
        cell.terrainState.hp = hp
    state.recentEvents.append(
        BattleEvent(
            id=f"event_{uuid4().hex[:10]}",
            type="terrain_damaged",
            timestamp=time(),
            actorId=attacker.id,
            targetPosition=pos,
            terrainType=cell.terrainType,
            value=amount,
            visualKey="terrain-wood-stake",
            metadata={"hpAfter": hp},
        )
    )
    state.log.append(f"{attacker.name} damaged wood stake at ({pos.x}, {pos.y}) for {amount}")
    if hp <= 0:
        old = cell.terrainType
        cell.terrainType = "normal"
        cell.terrainState = None
        state.recentEvents.append(
            BattleEvent(
                id=f"event_{uuid4().hex[:10]}",
                type="terrain_destroyed",
                timestamp=time(),
                actorId=attacker.id,
                targetPosition=pos,
                oldTerrainType=old,
                newTerrainType="normal",
                visualKey="terrain-destroyed",
            )
        )
        state.log.append(f"Wood stake at ({pos.x}, {pos.y}) was destroyed")
    return amount


def trigger_action_start_terrain(state: GameState, entity: BattleEntity, rng: Random | None = None) -> bool:
    if entity.type == "monster" or not entity.isAlive:
        return False
    cell = get_cell(state.gameMap, entity.position)
    if not cell:
        return False
    effect = terrain_definition(cell.terrainType).onTurnStartEffect
    if not effect:
        return False
    roller = rng or Random()
    should_damage = effect.type == "terrain_damage"
    if effect.type == "luck_based_damage":
        chance = max(0, min(100, 100 - entity.luck)) / 100
        should_damage = roller.random() < chance
    state.recentEvents.append(
        BattleEvent(
            id=f"event_{uuid4().hex[:10]}",
            type="terrain_triggered",
            timestamp=time(),
            targetPosition=entity.position,
            terrainType=cell.terrainType,
            value=effect.value if should_damage else 0,
            visualKey=f"terrain-{cell.terrainType}",
            metadata={"hit": should_damage},
        )
    )
    if not should_damage:
        state.log.append(f"{entity.name} avoided {cell.terrainType} terrain damage")
        return False
    actual = apply_hp_loss_to_state(
        state,
        entity,
        entity,
        effect.value,
        raw_damage=effect.value,
        sync_links=False,
    )
    state.log.append(f"{entity.name} took {actual} {cell.terrainType} terrain damage")
    return not entity.isAlive


def tick_terrain_durations(state: GameState) -> None:
    for cell in state.gameMap.cells.values():
        state_data = cell.terrainState
        if not state_data or state_data.duration in (None, "permanent"):
            continue
        state_data.duration = max(0, int(state_data.duration) - 1)
        if state_data.duration > 0:
            continue
        old = cell.terrainType
        restored = state_data.originalTerrainType or "normal"
        cell.terrainType = restored
        cell.terrainState = None
        ensure_cell_runtime_state(cell)
        state.recentEvents.append(
            BattleEvent(
                id=f"event_{uuid4().hex[:10]}",
                type="terrain_changed",
                timestamp=time(),
                targetPosition=cell.position,
                oldTerrainType=old,
                newTerrainType=restored,
                visualKey=f"terrain-{restored}",
                metadata={"reason": "duration_expired"},
            )
        )
        state.log.append(f"Terrain at ({cell.x}, {cell.y}) restored from {old} to {restored}")
