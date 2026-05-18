import pytest

from app.game.engine import basic_attack, create_state
from app.game.fixtures import DEFAULT_MAP, demo_entity
from app.game.models import BattleEntity, SkillInstance
from app.game.reward import RewardError, choose_kill_reward


def monster(entity_id: str, x: int, y: int, hp: int = 100) -> BattleEntity:
    return BattleEntity(
        id=entity_id,
        type="monster",
        name="Monster",
        x=x,
        y=y,
        maxHp=hp,
        currentHp=hp,
        baseAttack=20,
        currentAttack=20,
        baseDefense=0,
        currentDefense=0,
        attackRange=1,
        tempApPerTurn=0,
        speed=0,
        critRate=0,
        luck=0,
        joinOrder=99,
    )


def test_monster_counterattacks_when_damaged_in_range() -> None:
    attacker = demo_entity("a", "A", 0, 0, 1, speed=10)
    target = monster("m", 1, 0)
    state = create_state(DEFAULT_MAP, [attacker, target])

    basic_attack(state, "a", "m")

    assert target.currentHp == 80
    assert attacker.currentHp == 85


def test_killing_monster_grants_random_common_skill() -> None:
    attacker = demo_entity("a", "A", 0, 0, 1, speed=10)
    attacker.skillInstances.clear()
    target = monster("m", 1, 0, hp=10)
    state = create_state(DEFAULT_MAP, [attacker, target])

    basic_attack(state, "a", "m")

    assert not target.isAlive
    assert [skill.templateId for skill in attacker.skillInstances] == ["bomb"]


def test_killing_character_creates_choice_reward_and_can_choose() -> None:
    attacker = demo_entity("a", "A", 0, 0, 1, speed=10)
    target = demo_entity("b", "B", 1, 0, 2, speed=8)
    target.currentHp = 5
    target.skillInstances = [SkillInstance("reward_1", "bomb", "start_common")]
    state = create_state(DEFAULT_MAP, [attacker, target])

    basic_attack(state, "a", "b")

    assert "a" in state.pendingRewards
    choose_kill_reward(state, "a", "bomb")
    assert "a" not in state.pendingRewards
    assert any(skill.source == "kill_reward" and skill.templateId == "bomb" for skill in attacker.skillInstances)


def test_choose_kill_reward_rejects_invalid_choice() -> None:
    attacker = demo_entity("a", "A", 0, 0, 1, speed=10)
    target = demo_entity("b", "B", 1, 0, 2, speed=8)
    target.currentHp = 5
    state = create_state(DEFAULT_MAP, [attacker, target])

    basic_attack(state, "a", "b")

    with pytest.raises(RewardError):
        choose_kill_reward(state, "a", "not_a_reward")
