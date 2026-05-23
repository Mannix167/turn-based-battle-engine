from app.game.engine import basic_attack, create_state
from app.game.fixtures import DEFAULT_MAP, demo_entity
from app.game.models import BattleEntity, GameMap, MapCell, SkillInstance
from app.game.victory import update_victory


def test_owner_death_defeats_owned_summon_chain() -> None:
    attacker = demo_entity("attacker", "Attacker", 0, 0, 1, speed=10)
    owner = demo_entity("owner", "Owner", 1, 0, 2, speed=8)
    owner.currentHp = 1
    summon = BattleEntity(
        id="summon_a",
        type="summon",
        name="Summon A",
        ownerId="owner",
        controllerId="owner",
        x=2,
        y=0,
        maxHp=20,
        currentHp=20,
        baseAttack=5,
        currentAttack=5,
        baseDefense=0,
        currentDefense=0,
        attackRange=1,
        tempApPerTurn=1,
        speed=5,
        critRate=0,
        luck=0,
        joinOrder=3,
    )
    child = BattleEntity(
        id="summon_b",
        type="summon",
        name="Summon B",
        ownerId="summon_a",
        controllerId="owner",
        x=3,
        y=0,
        maxHp=20,
        currentHp=20,
        baseAttack=5,
        currentAttack=5,
        baseDefense=0,
        currentDefense=0,
        attackRange=1,
        tempApPerTurn=1,
        speed=5,
        critRate=0,
        luck=0,
        joinOrder=4,
    )
    state = create_state(DEFAULT_MAP, [attacker, owner, summon, child])

    basic_attack(state, "attacker", "owner")

    assert not owner.isAlive
    assert not summon.isAlive
    assert not child.isAlive


def test_owner_turn_start_terrain_death_defeats_owned_summon() -> None:
    lava_map = GameMap(id="lava_map", name="Lava Map", width=4, height=3)
    lava_cell = MapCell(0, 0, terrainType="lava")
    lava_map.cells = {lava_cell.position: lava_cell}
    owner = demo_entity("owner", "Owner", 0, 0, 1, speed=10)
    owner.currentHp = 5
    summon = BattleEntity(
        id="summon_a",
        type="summon",
        name="Summon A",
        ownerId="owner",
        controllerId="owner",
        x=1,
        y=0,
        maxHp=20,
        currentHp=20,
        baseAttack=5,
        currentAttack=5,
        baseDefense=0,
        currentDefense=0,
        attackRange=1,
        tempApPerTurn=1,
        speed=5,
        critRate=0,
        luck=0,
        joinOrder=2,
    )

    create_state(lava_map, [owner, summon])

    assert not owner.isAlive
    assert not summon.isAlive


def test_same_faction_entities_are_allied_and_victory_uses_characters_only() -> None:
    a = demo_entity("a", "A", 0, 0, 1, speed=10)
    b = demo_entity("b", "B", 1, 0, 2, speed=8)
    c = demo_entity("c", "C", 2, 0, 3, speed=6)
    a.factionId = "team"
    b.factionId = "team"
    c.factionId = "other"
    state = create_state(DEFAULT_MAP, [a, b, c])

    try:
        basic_attack(state, "a", "b")
    except ValueError as exc:
        assert "ally" in str(exc)
    else:
        raise AssertionError("same faction attack should be rejected")

    c.isAlive = False
    monster = BattleEntity(
        id="monster",
        type="monster",
        name="Monster",
        x=3,
        y=0,
        maxHp=10,
        currentHp=10,
        baseAttack=1,
        currentAttack=1,
        baseDefense=0,
        currentDefense=0,
        attackRange=1,
        tempApPerTurn=0,
        speed=0,
        critRate=0,
        luck=0,
        joinOrder=4,
        factionId="monster",
    )
    state.entities[monster.id] = monster

    assert update_victory(state) is True
    assert state.winnerGroup == ["a", "b"]


def test_summon_death_does_not_create_skill_reward() -> None:
    attacker = demo_entity("attacker", "Attacker", 0, 0, 1, speed=10)
    summon = BattleEntity(
        id="summon_a",
        type="summon",
        name="Summon A",
        ownerId="owner",
        controllerId="owner",
        x=1,
        y=0,
        maxHp=5,
        currentHp=5,
        baseAttack=5,
        currentAttack=5,
        baseDefense=0,
        currentDefense=0,
        attackRange=1,
        tempApPerTurn=1,
        speed=5,
        critRate=0,
        luck=0,
        joinOrder=2,
        skillInstances=[SkillInstance("summon_bomb", "bomb", "summon")],
    )
    state = create_state(DEFAULT_MAP, [attacker, summon])

    basic_attack(state, "attacker", "summon_a")

    assert not summon.isAlive
    assert state.pendingRewards == {}
