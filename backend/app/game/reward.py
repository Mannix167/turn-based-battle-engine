from random import Random
from time import time
from uuid import uuid4

from app.game.alliance import remove_alliance
from app.game.models import BattleEntity, GameState, PendingReward, Rarity, SkillInstance


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
        skill = grant_random_common_skill(
            killer,
            rng,
            state.rewardSkillPoolTemplateIds,
            state.rewardSkillTemplateRarities,
            state.rarityDropWeights,
            state.maxSkillStackQuantity,
            state.log,
        )
        if skill:
            state.log.append(f"{killer.name} gained a random common skill")
        else:
            state.log.append(f"{killer.name} defeated {defeated.name}, but the reward pool is empty")
        return
    if defeated.type == "summon":
        return
    if defeated.type == "character":
        choices = [
            skill.templateId
            for skill in defeated.skillInstances
            if not skill.isUsed and skill.source != "character_default"
        ]
        if choices:
            state.pendingRewards[killer.id] = PendingReward(killer.id, defeated.id, choices)
            state.log.append(f"{killer.name} can choose a skill reward from {defeated.name}")
        else:
            skill = grant_random_common_skill(
                killer,
                rng,
                state.rewardSkillPoolTemplateIds,
                state.rewardSkillTemplateRarities,
                state.rarityDropWeights,
                state.maxSkillStackQuantity,
                state.log,
            )
            if skill:
                state.log.append(f"{killer.name} gained a random common skill")
            else:
                state.log.append(f"{killer.name} defeated {defeated.name}, but the reward pool is empty")


def grant_random_common_skill(
    entity: BattleEntity,
    rng: Random | None = None,
    reward_pool_template_ids: list[str] | None = None,
    template_rarities: dict[str, Rarity] | None = None,
    rarity_weights: dict[Rarity, int] | None = None,
    max_quantity: int = 3,
    log: list[str] | None = None,
) -> SkillInstance | None:
    roller = rng or Random()
    pool = reward_pool_template_ids if reward_pool_template_ids is not None else COMMON_REWARD_TEMPLATE_IDS
    if not pool:
        return None
    if len(pool) == 1:
        return grant_skill(entity, pool[0], "random_reward", max_quantity=max_quantity, log=log)
    template_id = weighted_choice_by_rarity(roller, pool, template_rarities or {}, rarity_weights or {})
    return grant_skill(entity, template_id, "random_reward", max_quantity=max_quantity, log=log)


def weighted_choice_by_rarity(
    rng: Random,
    pool: list[str],
    template_rarities: dict[str, Rarity],
    rarity_weights: dict[Rarity, int],
) -> str:
    weighted: list[tuple[str, int]] = []
    for template_id in pool:
        rarity = template_rarities.get(template_id, "common")
        weight = max(0, int(rarity_weights.get(rarity, 1)))
        if weight > 0:
            weighted.append((template_id, weight))
    if not weighted:
        return rng.choice(pool)
    total = sum(weight for _, weight in weighted)
    roll = rng.uniform(0, total) if hasattr(rng, "uniform") else rng.random() * total
    upto = 0.0
    for template_id, weight in weighted:
        upto += weight
        if roll <= upto:
            return template_id
    return weighted[-1][0]


def grant_skill(
    entity: BattleEntity,
    template_id: str,
    source: str,
    *,
    max_quantity: int = 3,
    log: list[str] | None = None,
) -> SkillInstance | None:
    source_type = normalize_source_type(source)
    existing = next(
        (
            skill
            for skill in entity.skillInstances
            if skill.templateId == template_id and not skill.isUsed and skill.quantity > 0
        ),
        None,
    )
    if existing:
        existing.maxQuantity = max(1, existing.maxQuantity or max_quantity)
        if existing.quantity >= existing.maxQuantity:
            if log is not None:
                log.append(f"{entity.name} already has {existing.maxQuantity} copies of {template_id}; reward discarded")
            return None
        existing.quantity += 1
        existing.source = source
        if source_type not in existing.sourceTypes:
            existing.sourceTypes.append(source_type)
        return existing
    instance = SkillInstance(
        instanceId=f"{entity.id}_{template_id}_{uuid4().hex[:8]}",
        templateId=template_id,
        source=source,
        quantity=1,
        maxQuantity=max(1, max_quantity),
        sourceTypes=[source_type],
        acquiredAt=str(time()),
    )
    entity.skillInstances.append(instance)
    return instance


def normalize_source_type(source: str) -> str:
    if source == "character_default":
        return "character"
    if source == "start_common":
        return "common"
    if source in {"kill_reward", "monster_reward", "random_reward", "treasure"}:
        return "reward"
    return source


def choose_kill_reward(state: GameState, killer_id: str, template_id: str) -> None:
    reward = state.pendingRewards.get(killer_id)
    if not reward:
        raise RewardError("No pending reward for this entity")
    if template_id not in reward.availableTemplateIds:
        raise RewardError("Selected skill is not available as a reward")
    skill = grant_skill(
        state.entities[killer_id],
        template_id,
        "kill_reward",
        max_quantity=state.maxSkillStackQuantity,
        log=state.log,
    )
    del state.pendingRewards[killer_id]
    if not skill:
        state.log.append("Selected reward was discarded because the skill stack is full")
