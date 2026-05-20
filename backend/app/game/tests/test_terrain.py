import pytest

from app.game.engine import basic_attack_terrain, create_state, move, use_skill
from app.game.fixtures import demo_entity
from app.game.map_system import MapRuleError, move_entity
from app.game.models import BattleEntity, GameMap, MapCell, Position, SkillInstance
from app.game.skills.skill_template import EffectConfig, SkillTemplate
from app.game.terrain import get_cell, tick_terrain_durations, trigger_action_start_terrain


def terrain_map(*cells: MapCell) -> GameMap:
    game_map = GameMap(id="terrain_map", name="Terrain Map", width=4, height=3)
    game_map.cells = {cell.position: cell for cell in cells}
    return game_map


def entity(entity_id: str, x: int, y: int, *, speed: int = 10, hp: int = 100, attack: int = 20) -> BattleEntity:
    item = demo_entity(entity_id, entity_id, x, y, 1, speed=speed)
    item.maxHp = hp
    item.currentHp = hp
    item.baseAttack = attack
    item.currentAttack = attack
    return item


def test_swamp_leave_costs_two_ap() -> None:
    game_map = terrain_map(MapCell(0, 0, terrainType="swamp"))
    actor = entity("a", 0, 0)
    state = create_state(game_map, [actor])

    move(state, "a", Position(1, 0))

    assert actor.temporaryAP == 0
    assert actor.permanentAP == 3


def test_ice_leave_costs_zero_ap_even_without_ap() -> None:
    game_map = terrain_map(MapCell(0, 0, terrainType="ice"))
    actor = entity("a", 0, 0)
    state = create_state(game_map, [actor])
    actor.temporaryAP = 0
    actor.permanentAP = 0

    move(state, "a", Position(1, 0))

    assert actor.position == Position(1, 0)
    assert actor.temporaryAP == 0
    assert actor.permanentAP == 0


def test_obstacle_and_wood_stake_are_not_walkable() -> None:
    for terrain_type in ("obstacle", "wood_stake"):
        game_map = terrain_map(MapCell(1, 0, terrainType=terrain_type))
        actor = entity("a", 0, 0)
        state = create_state(game_map, [actor])
        with pytest.raises(MapRuleError):
            move_entity(state, "a", Position(1, 0))


def test_lava_turn_start_deals_true_damage_without_reward() -> None:
    game_map = terrain_map(MapCell(0, 0, terrainType="lava"))
    actor = entity("a", 0, 0, hp=5)
    state = create_state(game_map, [actor])

    assert not actor.isAlive
    assert state.pendingRewards == {}
    assert any(event.type == "terrain_triggered" and event.terrainType == "lava" for event in state.recentEvents)


def test_thunderstorm_uses_luck_based_probability() -> None:
    game_map = terrain_map(MapCell(0, 0, terrainType="thunderstorm"))
    actor = entity("a", 0, 0)
    actor.luck = 100
    state = create_state(game_map, [actor])
    hp_after_safe_start = actor.currentHp

    actor.luck = 0
    trigger_action_start_terrain(state, actor)

    assert hp_after_safe_start == 100
    assert actor.currentHp == 70


def test_wood_stake_can_be_attacked_and_becomes_normal() -> None:
    game_map = terrain_map(MapCell(1, 0, terrainType="wood_stake"))
    actor = entity("a", 0, 0, attack=7)
    state = create_state(game_map, [actor])

    basic_attack_terrain(state, "a", Position(1, 0))
    cell = get_cell(state.gameMap, Position(1, 0))
    assert cell.terrainType == "wood_stake"
    assert cell.terrainState.hp == 3

    actor.temporaryAP = 1
    basic_attack_terrain(state, "a", Position(1, 0))

    assert get_cell(state.gameMap, Position(1, 0)).terrainType == "normal"
    assert any(event.type == "terrain_destroyed" for event in state.recentEvents)


def test_line_skill_stops_at_obstacle_and_wood_stake() -> None:
    for terrain_type in ("obstacle", "wood_stake"):
        game_map = terrain_map(MapCell(1, 0, terrainType=terrain_type))
        caster = entity("caster", 0, 0)
        target = entity("target", 2, 0, speed=1)
        caster.skillInstances = [SkillInstance("laser_1", "laser", "start_common")]
        state = create_state(game_map, [caster, target])
        template = SkillTemplate(
            id="laser",
            name="Laser",
            description="Line damage",
            category="common",
            cost=1,
            range=3,
            targetType="direction",
            areaType="line",
            effects=[EffectConfig("damage", 10)],
        )

        use_skill(state, "caster", "laser_1", template, direction="right")

        assert target.currentHp == target.maxHp


def test_change_terrain_modifies_runtime_map_and_initializes_wood_stake() -> None:
    source_map = terrain_map(MapCell(1, 0, terrainType="normal"))
    game_map = terrain_map(MapCell(1, 0, terrainType=source_map.cells[Position(1, 0)].terrainType))
    caster = entity("caster", 0, 0)
    caster.skillInstances = [SkillInstance("stake_1", "stake", "start_common")]
    state = create_state(game_map, [caster])
    template = SkillTemplate(
        id="stake",
        name="Raise Stake",
        description="Create destructible terrain",
        category="common",
        cost=1,
        range=3,
        targetType="emptyCell",
        areaType="single",
        canTargetEmptyCell=True,
        effects=[EffectConfig("change_terrain", metadata={"terrainType": "wood_stake"})],
    )

    use_skill(state, "caster", "stake_1", template, target_position=Position(1, 0))
    cell = get_cell(state.gameMap, Position(1, 0))

    assert cell.terrainType == "wood_stake"
    assert cell.terrainState.hp == 10
    assert cell.terrainState.defense == 0
    assert source_map.cells[Position(1, 0)].terrainType == "normal"


def test_terrain_death_does_not_trigger_monster_counterattack() -> None:
    game_map = terrain_map(MapCell(0, 0, terrainType="lava"))
    actor = entity("a", 0, 0, hp=5)
    monster = entity("m", 1, 0, speed=1)
    monster.type = "monster"
    monster.baseAttack = 99
    monster.currentAttack = 99
    create_state(game_map, [actor, monster])

    assert not actor.isAlive
    assert monster.currentHp == monster.maxHp


def test_temporary_terrain_restores_original_type_when_duration_expires() -> None:
    game_map = terrain_map(MapCell(1, 0, terrainType="normal"))
    caster = entity("caster", 0, 0)
    caster.skillInstances = [SkillInstance("lava_1", "lava", "start_common")]
    state = create_state(game_map, [caster])
    template = SkillTemplate(
        id="lava",
        name="Temporary Lava",
        description="Create temporary terrain",
        category="common",
        cost=1,
        range=3,
        targetType="emptyCell",
        areaType="single",
        canTargetEmptyCell=True,
        effects=[EffectConfig("change_terrain", duration=1, metadata={"terrainType": "lava"})],
    )

    use_skill(state, "caster", "lava_1", template, target_position=Position(1, 0))
    assert get_cell(state.gameMap, Position(1, 0)).terrainType == "lava"

    tick_terrain_durations(state)

    assert get_cell(state.gameMap, Position(1, 0)).terrainType == "normal"
