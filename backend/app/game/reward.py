from random import Random
from uuid import uuid4

from app.game.alliance import remove_alliance
from app.game.models import BattleEntity, GameState, PendingReward, SkillInstance


COMMON_REWARD_TEMPLATE_IDS = ["bomb"]


class RewardError(ValueError):
    pass


def handle_defeat(
    state: GameState,
    defeated: BattleEntity,
    killer: BattleEntity | None,
    rng: Random | None = None,
) -> None:
    if defeated.isAlive:
        return
    defeated.statusEffects.clear()
    remove_alliance(state, defeated.id)
    if not killer or not killer.isAlive or killer.id == defeated.id:
        return
    if defeated.type == "monster":
        grant_random_common_skill(killer, rng)
        state.log.append(f"{killer.name} gained a random common skill")
        return
    if defeated.type in {"character", "summon"}:
        choices = [
            skill.templateId
            for skill in defeated.skillInstances
            if not skill.isUsed and skill.source != "character_default"
        ]
        if choices:
            state.pendingRewards[killer.id] = PendingReward(killer.id, defeated.id, choices)
            state.log.append(f"{killer.name} can choose a skill reward from {defeated.name}")
        else:
            grant_random_common_skill(killer, rng)
            state.log.append(f"{killer.name} gained a random common skill")


def grant_random_common_skill(entity: BattleEntity, rng: Random | None = None) -> SkillInstance:
    roller = rng or Random()
    template_id = roller.choice(COMMON_REWARD_TEMPLATE_IDS)
    return grant_skill(entity, template_id, "random_reward")


def grant_skill(entity: BattleEntity, template_id: str, source: str) -> SkillInstance:
    instance = SkillInstance(
        instanceId=f"{entity.id}_{template_id}_{uuid4().hex[:8]}",
        templateId=template_id,
        source=source,
    )
    entity.skillInstances.append(instance)
    return instance


def choose_kill_reward(state: GameState, killer_id: str, template_id: str) -> None:
    reward = state.pendingRewards.get(killer_id)
    if not reward:
        raise RewardError("No pending reward for this entity")
    if template_id not in reward.availableTemplateIds:
        raise RewardError("Selected skill is not available as a reward")
    grant_skill(state.entities[killer_id], template_id, "kill_reward")
    del state.pendingRewards[killer_id]
