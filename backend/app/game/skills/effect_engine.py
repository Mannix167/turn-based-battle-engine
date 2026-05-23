from collections.abc import Callable
from math import ceil
from random import randint
from time import time
from uuid import uuid4

from app.game.action_points import consume_ap
from app.game.alliance import add_alliance, remove_alliance
from app.game.damage import apply_damage_to_state, apply_fixed_damage_to_state
from app.game.distance import manhattan
from app.game.map_system import assert_empty_valid_cell, is_occupied, is_valid_cell, occupied_treasure_at
from app.game.models import BattleEntity, BattleEvent, Direction, GameState, Position, SkillInstance, StatusEffect
from app.game.reward import grant_skill
from app.game.skills.skill_template import EffectConfig, SkillTemplate
from app.game.skills.targeting import TargetingError, resolve_targets, validate_entity_target
from app.game.terrain import TERRAIN_DEFINITIONS, blocks_line_of_effect, change_terrain


class EffectEngineError(ValueError):
    pass


EffectHandler = Callable[[GameState, BattleEntity, list[BattleEntity], EffectConfig], None]


class EffectEngine:
    def __init__(self) -> None:
        self.handlers: dict[str, EffectHandler] = {
            "damage": self._damage,
            "heal": self._heal,
            "add_buff": self._add_buff,
            "remove_buff": self._remove_buff,
            "modify_stat": self._modify_stat,
            "set_stat_temporarily": self._set_stat_temporarily,
            "add_permanent_ap": self._add_permanent_ap,
            "add_temporary_ap": self._add_temporary_ap,
            "grant_permanent_ap": self._add_permanent_ap,
            "grant_temporary_ap": self._add_temporary_ap,
            "grant_random_common_skill": self._grant_random_common_skill,
            "extra_turn_next_round": self._extra_turn_next_round,
            "alliance": self._alliance,
            "create_alliance": self._alliance,
            "remove_alliance": self._remove_alliance,
            "delayed_damage": self._delayed_damage,
            "delayed_area_damage": self._delayed_area_damage,
            "link_damage_sync": self._link_damage_sync,
            "swap_current_hp": self._swap_current_hp,
            "conditional_execute": self._conditional_execute,
            "instant_kill": self._instant_kill,
            "random_damage": self._random_damage,
            "summon": self._summon,
            "grant_skill": self._grant_skill,
            "change_terrain": self._change_terrain,
        }
        self.template: SkillTemplate | None = None
        self.target_position: Position | None = None

    def apply(
        self,
        state: GameState,
        caster: BattleEntity,
        template: SkillTemplate,
        target_id: str | None = None,
        second_target_id: str | None = None,
        target_position: Position | None = None,
        direction: Direction | None = None,
    ) -> None:
        self.template = template
        self.target_position = target_position
        state.recentDamagedEntityIds = []
        state.recentDamageEvents = []
        state.recentEvents = []
        targets = resolve_targets(state, caster, template, target_id, second_target_id, target_position, direction)
        targets = expand_area_targets(state, caster, template, targets, target_position)
        for effect in template.effects:
            if effect.type not in self.handlers:
                raise EffectEngineError(f"Effect type is not implemented: {effect.type}")
        consume_ap(caster, template.cost)
        append_skill_cast_event(state, caster, template, targets, target_position, direction)
        for effect in template.effects:
            handler = self.handlers.get(effect.type)
            effect = effect_with_metadata_fields(effect)
            if effect.type == "damage" and template.affectSelfDamage:
                metadata = {**effect.metadata, "affectSelfDamage": True}
                effect = EffectConfig(
                    type=effect.type,
                    value=effect.value,
                    duration=effect.duration,
                    delayTurns=effect.delayTurns,
                    stat=effect.stat,
                    buffType=effect.buffType,
                    metadata=metadata,
                )
            handler(state, caster, targets, effect)

    def _damage(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        value = effect.value
        if value is None:
            if effect.metadata.get("damageType") != "percent_max_hp":
                raise EffectEngineError("Damage effect requires value")
        for target in targets:
            amount_value = value
            if effect.metadata.get("damageType") == "percent_max_hp":
                amount_value = ceil(target.maxHp * float(effect.metadata.get("percent", 0)))
            if effect.metadata.get("fixedDamage"):
                amount = apply_fixed_damage_to_state(
                    state,
                    caster,
                    target,
                    amount_value or 0,
                    allow_self=bool(effect.metadata.get("affectSelfDamage")),
                )
                state.log.append(f"{caster.name}'s effect damaged {target.name} for {amount}")
                append_skill_damage_event(state, caster, target, self.template, amount, is_crit=False)
            else:
                if effect.metadata.get("damageType") in {"true", "percent_max_hp"}:
                    amount = apply_fixed_damage_to_state(
                        state,
                        caster,
                        target,
                        amount_value or 0,
                        allow_self=bool(effect.metadata.get("affectSelfDamage")),
                    )
                    state.log.append(f"{caster.name}'s effect damaged {target.name} for {amount}")
                    append_skill_damage_event(state, caster, target, self.template, amount, is_crit=False)
                    continue
                result = apply_damage_to_state(state, caster, target, base_damage=amount_value)
                state.log.append(f"{caster.name}'s effect damaged {target.name} for {result.amount}")
                append_skill_damage_event(state, caster, target, self.template, result.amount, is_crit=result.isCrit)

    def _heal(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        value = effect.value or 0
        for target in targets:
            target.currentHp = min(target.maxHp, target.currentHp + value)
            state.log.append(f"{caster.name}'s effect healed {target.name} for {value}")

    def _add_buff(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        buff_type = effect.metadata.get("buffType") or effect.metadata.get("type")
        if not buff_type:
            raise EffectEngineError("add_buff requires metadata.buffType")
        for target in targets:
            target.statusEffects.append(
                StatusEffect(
                    id=f"status_{uuid4().hex[:10]}",
                    type=buff_type,
                    sourceEntityId=caster.id,
                    targetEntityId=target.id,
                    duration=effect.metadata.get("duration"),
                    remainingTurns=effect.metadata.get("duration"),
                    value=effect.value,
                    metadata=effect.metadata,
                )
            )

    def _remove_buff(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        buff_type = effect.metadata.get("buffType")
        for target in targets:
            target.statusEffects = [
                status for status in target.statusEffects if buff_type and status.type != buff_type
            ]

    def _modify_stat(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        stat = effect.metadata.get("stat")
        value = effect.value or 0
        if not stat:
            raise EffectEngineError("modify_stat requires metadata.stat")
        for target in targets:
            _change_stat(target, stat, value)
            duration = effect.metadata.get("duration")
            if duration:
                target.statusEffects.append(
                    StatusEffect(
                        id=f"status_{uuid4().hex[:10]}",
                        type="stat_modifier",
                        sourceEntityId=caster.id,
                        targetEntityId=target.id,
                        duration=duration,
                        remainingTurns=duration,
                        value=value,
                        metadata={"stat": stat},
                    )
                )

    def _set_stat_temporarily(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        stat = effect.metadata.get("stat")
        duration = effect.metadata.get("duration")
        if not stat or duration is None:
            raise EffectEngineError("set_stat_temporarily requires metadata.stat and metadata.duration")
        for target in targets:
            field_name = stat_field_name(stat)
            current = getattr(target, field_name)
            delta = (effect.value or 0) - current
            _change_stat(target, stat, delta)
            target.statusEffects.append(
                StatusEffect(
                    id=f"status_{uuid4().hex[:10]}",
                    type="stat_modifier",
                    sourceEntityId=caster.id,
                    targetEntityId=target.id,
                    duration=duration,
                    remainingTurns=duration,
                    value=delta,
                    metadata={"stat": stat},
                )
            )

    def _add_permanent_ap(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        for target in targets:
            target.permanentAP += effect.value or 0

    def _add_temporary_ap(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        for target in targets:
            target.temporaryAP += effect.value or 0

    def _extra_turn_next_round(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        for target in targets:
            target.extraTurnNextRound += effect.value or 1

    def _alliance(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        for target in targets:
            add_alliance(state, caster.id, target.id, effect.metadata.get("duration"))

    def _remove_alliance(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        if targets:
            for target in targets:
                remove_alliance(state, caster.id, target.id)
        else:
            remove_alliance(state, caster.id)

    def _delayed_damage(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        turns = effect.metadata.get("turns", 1)
        for target in targets:
            target.statusEffects.append(
                StatusEffect(
                    id=f"status_{uuid4().hex[:10]}",
                    type="delayed_damage",
                    sourceEntityId=caster.id,
                    targetEntityId=target.id,
                    duration=turns,
                    remainingTurns=turns,
                    value=effect.value,
                    metadata={},
                )
            )

    def _delayed_area_damage(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        if self.target_position is None:
            raise EffectEngineError("delayed_area_damage requires target position")
        caster.statusEffects.append(
            StatusEffect(
                id=f"status_{uuid4().hex[:10]}",
                type="delayed_area_damage",
                sourceEntityId=caster.id,
                targetEntityId=caster.id,
                duration=effect.metadata.get("delayRounds", effect.delayTurns or 3),
                remainingTurns=effect.metadata.get("delayRounds", effect.delayTurns or 3),
                value=effect.value,
                metadata={
                    **effect.metadata,
                    "x": self.target_position.x,
                    "y": self.target_position.y,
                    "areaType": self.template.areaType if self.template else "square",
                    "areaSize": self.template.areaSize if self.template else 3,
                },
            )
        )

    def _link_damage_sync(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        if len(targets) != 2:
            raise EffectEngineError("link_damage_sync requires two targets")
        a, b = targets
        duration = effect.metadata.get("duration", effect.duration or 3)
        for target, linked in ((a, b), (b, a)):
            target.statusEffects.append(
                StatusEffect(
                    id=f"status_{uuid4().hex[:10]}",
                    type="damage_sync_link",
                    sourceEntityId=caster.id,
                    targetEntityId=target.id,
                    duration=duration,
                    remainingTurns=duration,
                    value=effect.value,
                    metadata={"linkedEntityId": linked.id},
                )
            )

    def _swap_current_hp(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        if len(targets) != 2:
            raise EffectEngineError("swap_current_hp requires two targets")
        a, b = targets
        a_hp, b_hp = a.currentHp, b.currentHp
        a.currentHp = min(b_hp, a.maxHp)
        b.currentHp = min(a_hp, b.maxHp)

    def _conditional_execute(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        percent = float(effect.metadata.get("percent", 0.15))
        for target in targets:
            if target.currentHp < target.maxHp * percent:
                amount = apply_fixed_damage_to_state(state, caster, target, target.currentHp, allow_self=True)
                state.log.append(f"{caster.name}'s effect executed {target.name} for {amount}")

    def _instant_kill(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        for target in targets:
            amount = apply_fixed_damage_to_state(state, caster, target, target.currentHp, allow_self=True)
            state.log.append(f"{caster.name}'s effect instantly defeated {target.name} for {amount}")

    def _random_damage(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        sides = int(effect.metadata.get("sides", 6))
        multiplier = int(effect.metadata.get("multiplier", 5))
        roll = randint(1, sides)
        self._damage(
            state,
            caster,
            targets,
            EffectConfig(type="damage", value=roll * multiplier, metadata=effect.metadata),
        )
        state.log.append(f"{caster.name}'s random hit rolled {roll}")

    def _summon(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        if self.target_position is None:
            raise EffectEngineError("summon requires target position")
        assert_empty_valid_cell(state, self.target_position)
        metadata = effect.metadata
        template_data = metadata.get("creatureTemplate")
        summon_skills = metadata.get("summonSkillTemplateIds", [])
        if isinstance(template_data, dict):
            max_hp = int(template_data.get("maxHp", metadata.get("maxHp", 30)))
            base_attack = int(template_data.get("baseAttack", metadata.get("baseAttack", 8)))
            base_defense = int(template_data.get("baseDefense", metadata.get("baseDefense", 1)))
            attack_range = int(template_data.get("attackRange", metadata.get("attackRange", 1)))
            temp_ap_per_turn = int(template_data.get("tempApPerTurn", metadata.get("tempApPerTurn", 1)))
            speed = int(template_data.get("speed", metadata.get("speed", 5)))
            crit_rate = int(template_data.get("critRate", metadata.get("critRate", 0)))
            luck = int(template_data.get("luck", metadata.get("luck", 0)))
            name = str(template_data.get("name", metadata.get("name", f"{caster.name}'s Summon")))
            token_image_url = template_data.get("tokenImageUrl")
            portrait_image_url = template_data.get("portraitImageUrl")
            template_id = template_data.get("id") or metadata.get("creatureTemplateId")
            summon_skills = template_data.get("summonSkillTemplateIds", summon_skills)
        else:
            max_hp = metadata.get("maxHp", 30)
            base_attack = metadata.get("baseAttack", 8)
            base_defense = metadata.get("baseDefense", 1)
            attack_range = metadata.get("attackRange", 1)
            temp_ap_per_turn = metadata.get("tempApPerTurn", 1)
            speed = metadata.get("speed", 5)
            crit_rate = metadata.get("critRate", 0)
            luck = metadata.get("luck", 0)
            name = metadata.get("name", f"{caster.name}'s Summon")
            token_image_url = metadata.get("tokenImageUrl")
            portrait_image_url = metadata.get("portraitImageUrl")
            template_id = metadata.get("creatureTemplateId")
        join_order = max((entity.joinOrder for entity in state.entities.values()), default=0) + 1
        summon = BattleEntity(
            id=f"summon_{uuid4().hex[:10]}",
            type="summon",
            templateId=template_id,
            name=name,
            ownerId=caster.id,
            controllerId=caster.controllerId or caster.id,
            factionId=caster.factionId,
            x=self.target_position.x,
            y=self.target_position.y,
            maxHp=max_hp,
            currentHp=max_hp,
            baseAttack=base_attack,
            currentAttack=base_attack,
            baseDefense=base_defense,
            currentDefense=base_defense,
            attackRange=attack_range,
            tempApPerTurn=temp_ap_per_turn,
            speed=speed,
            critRate=crit_rate,
            luck=luck,
            joinOrder=join_order,
            tokenImageUrl=token_image_url,
            portraitImageUrl=portrait_image_url,
            activeRound=state.roundNumber + 1,
        )
        for offset, template_id in enumerate(summon_skills or [], start=1):
            summon.skillInstances.append(
                SkillInstance(
                    instanceId=f"{summon.id}_{template_id}_summon_{offset}",
                    templateId=template_id,
                    source="summon",
                    sourceTypes=["summon"],
                    maxQuantity=state.maxSkillStackQuantity,
                )
            )
        state.entities[summon.id] = summon
        state.log.append(f"{caster.name} summoned {summon.name}")

    def _grant_skill(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        template_id = effect.metadata.get("templateId")
        if not template_id:
            raise EffectEngineError("grant_skill requires metadata.templateId")
        for target in targets:
            grant_skill(
                target,
                template_id,
                "random_reward",
                max_quantity=state.maxSkillStackQuantity,
                log=state.log,
            )

    def _grant_random_common_skill(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        from app.game.reward import grant_random_common_skill

        for target in targets:
            grant_random_common_skill(
                target,
                reward_pool_template_ids=state.rewardSkillPoolTemplateIds,
                template_rarities=state.rewardSkillTemplateRarities,
                rarity_weights=state.rarityDropWeights,
                max_quantity=state.maxSkillStackQuantity,
                log=state.log,
            )

    def _change_terrain(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        terrain_type = effect.metadata.get("terrainType")
        if terrain_type not in TERRAIN_DEFINITIONS or terrain_type == "obstacle":
            raise EffectEngineError("change_terrain requires a supported non-obstacle terrainType")
        positions = terrain_effect_positions(
            state,
            caster,
            self.target_position or (targets[0].position if targets else caster.position),
            effect,
        )
        for pos in positions:
            if terrain_type == "wood_stake" and (is_occupied(state, pos) or occupied_treasure_at(state, pos)):
                continue
            change_terrain(
                state,
                pos,
                terrain_type,
                duration=effect.metadata.get("duration", effect.duration),
                created_by_skill_id=self.template.id if self.template else None,
                created_by_entity_id=caster.id,
            )


def use_skill(
    state: GameState,
    caster_id: str,
    skill_instance_id: str,
    template: SkillTemplate,
    target_id: str | None = None,
    second_target_id: str | None = None,
    target_position: Position | None = None,
    direction: Direction | None = None,
) -> None:
    caster = state.entities[caster_id]
    instance = next(
        (skill for skill in caster.skillInstances if skill.instanceId == skill_instance_id),
        None,
    )
    if not instance:
        raise EffectEngineError("Skill instance not found")
    if instance.templateId != template.id:
        raise EffectEngineError("Skill instance does not match template")
    if instance.quantity <= 0:
        raise EffectEngineError("Skill stack is empty")
    EffectEngine().apply(state, caster, template, target_id, second_target_id, target_position, direction)
    instance.quantity -= 1
    if instance.quantity <= 0:
        caster.skillInstances = [skill for skill in caster.skillInstances if skill.instanceId != skill_instance_id]
    state.log.append(f"{caster.name} used {template.name}")


def append_skill_cast_event(
    state: GameState,
    caster: BattleEntity,
    template: SkillTemplate,
    targets: list[BattleEntity],
    target_position: Position | None,
    direction: Direction | None,
) -> None:
    target_positions = skill_event_target_positions(state, caster, template, targets, target_position, direction)
    state.recentEvents.append(
        BattleEvent(
            id=f"event_{uuid4().hex[:10]}",
            type="skill_cast",
            timestamp=time(),
            actorId=caster.id,
            targetIds=[target.id for target in targets],
            sourcePosition=caster.position,
            targetPosition=target_positions[0] if target_positions else target_position,
            targetPositions=target_positions,
            skillTemplateId=template.id,
            visualKey=skill_visual_key(template),
            soundKey=skill_sound_key(template),
        )
    )


def append_skill_damage_event(
    state: GameState,
    caster: BattleEntity,
    target: BattleEntity,
    template: SkillTemplate | None,
    amount: int,
    *,
    is_crit: bool,
) -> None:
    if amount <= 0 or not template:
        return
    state.recentEvents.append(
        BattleEvent(
            id=f"event_{uuid4().hex[:10]}",
            type="skill_damage",
            timestamp=time(),
            actorId=caster.id,
            targetIds=[target.id],
            sourcePosition=caster.position,
            targetPosition=target.position,
            targetPositions=[target.position],
            skillTemplateId=template.id,
            value=amount,
            visualKey="critical-hit" if is_crit else skill_visual_key(template),
            soundKey="damage_hit",
            metadata={"isCrit": is_crit},
        )
    )


def skill_event_target_positions(
    state: GameState,
    caster: BattleEntity,
    template: SkillTemplate,
    targets: list[BattleEntity],
    target_position: Position | None,
    direction: Direction | None,
) -> list[Position]:
    if template.targetType == "direction" and direction:
        return directional_path(state, caster, template, direction)
    if target_position:
        return [target_position]
    return [target.position for target in targets]


def directional_path(
    state: GameState,
    caster: BattleEntity,
    template: SkillTemplate,
    direction: Direction,
) -> list[Position]:
    dx, dy = {
        "up": (0, -1),
        "down": (0, 1),
        "left": (-1, 0),
        "right": (1, 0),
    }[direction]
    positions: list[Position] = []
    for step in range(1, template.range + 1):
        pos = Position(caster.x + dx * step, caster.y + dy * step)
        if not is_valid_cell(state.gameMap, pos):
            break
        positions.append(pos)
        if blocks_line_of_effect(state.gameMap, pos):
            break
    return positions


def skill_visual_key(template: SkillTemplate) -> str:
    if template.visual.visualKey:
        return template.visual.visualKey
    if template.id == "laser" or (template.targetType == "direction" and template.areaType == "line"):
        return "laser-line"
    if any(effect.type == "heal" for effect in template.effects):
        return "heal"
    if any(effect.type in {"create_alliance", "alliance", "link_damage_sync"} for effect in template.effects):
        return "chain-link"
    if any(effect.type in {"conditional_execute", "instant_kill"} for effect in template.effects):
        return "execute"
    if any(effect.type == "change_terrain" for effect in template.effects):
        return "terrain-default"
    return "blast" if template.areaType in {"square", "circle", "cross"} else "slash"


def skill_sound_key(template: SkillTemplate) -> str | None:
    if template.visual.soundKey:
        return template.visual.soundKey
    if template.id == "laser" or (template.targetType == "direction" and template.areaType == "line"):
        return "skill_laser"
    if any(effect.type == "heal" for effect in template.effects):
        return "skill_heal"
    return "skill_blast"


def _change_stat(entity: BattleEntity, stat: str, value: int) -> None:
    field_name = stat_field_name(stat)
    setattr(entity, field_name, getattr(entity, field_name) + value)
    clamp_entity_stats(entity)


def clamp_entity_stats(entity: BattleEntity) -> None:
    entity.maxHp = max(1, entity.maxHp)
    entity.currentHp = max(0, min(entity.currentHp, entity.maxHp))
    entity.baseAttack = max(1, entity.baseAttack)
    entity.currentAttack = max(1, entity.currentAttack)
    entity.baseDefense = max(0, entity.baseDefense)
    entity.currentDefense = max(0, entity.currentDefense)
    entity.attackRange = max(1, entity.attackRange)
    entity.tempApPerTurn = max(0, entity.tempApPerTurn)
    entity.permanentAP = max(0, entity.permanentAP)
    entity.temporaryAP = max(0, entity.temporaryAP)
    entity.speed = max(0, entity.speed)
    entity.critRate = min(100, max(0, entity.critRate))
    entity.luck = min(100, max(0, entity.luck))


def stat_field_name(stat: str) -> str:
    field_name = {
        "attack": "currentAttack",
        "baseAttack": "currentAttack",
        "defense": "currentDefense",
        "baseDefense": "currentDefense",
        "speed": "speed",
        "luck": "luck",
        "critRate": "critRate",
        "temporaryApPerTurn": "tempApPerTurn",
    }.get(stat)
    if not field_name:
        raise EffectEngineError(f"Unsupported stat: {stat}")
    return field_name


def expand_area_targets(
    state: GameState,
    caster: BattleEntity,
    template: SkillTemplate,
    targets: list[BattleEntity],
    target_position: Position | None,
) -> list[BattleEntity]:
    if template.areaType not in {"cross", "square", "circle"}:
        return targets
    center = target_position or (targets[0].position if targets else caster.position)
    radius = max(1, template.areaSize // 2)
    expanded: list[BattleEntity] = []
    for entity in state.entities.values():
        if not entity.isAlive:
            continue
        if entity.id == caster.id and not template.affectSelfDamage:
            continue
        dx = abs(entity.x - center.x)
        dy = abs(entity.y - center.y)
        in_area = False
        if template.areaType == "square":
            in_area = dx <= radius and dy <= radius
        elif template.areaType == "circle":
            in_area = manhattan(center, entity.position) <= radius
        elif template.areaType == "cross":
            in_area = (dx == 0 and dy <= radius) or (dy == 0 and dx <= radius)
        if not in_area:
            continue
        try:
            validate_entity_target(state, caster, entity, template, check_range=False)
        except TargetingError:
            continue
        else:
            expanded.append(entity)
    return expanded


def terrain_effect_positions(
    state: GameState,
    caster: BattleEntity,
    center: Position,
    effect: EffectConfig,
) -> list[Position]:
    area_type = effect.metadata.get("areaType", "single")
    size = int(effect.metadata.get("areaSize", 1) or 1)
    if area_type == "single":
        return [center]
    radius = max(1, size // 2)
    positions: list[Position] = []
    if area_type == "square":
        for y in range(center.y - radius, center.y + radius + 1):
            for x in range(center.x - radius, center.x + radius + 1):
                positions.append(Position(x, y))
    elif area_type == "line_4dir":
        positions.append(center)
        for dx, dy in ((0, -1), (0, 1), (-1, 0), (1, 0)):
            for step in range(1, size + 1):
                positions.append(Position(caster.x + dx * step, caster.y + dy * step))
    else:
        raise EffectEngineError(f"Unsupported change_terrain areaType: {area_type}")
    return [
        pos
        for pos in positions
        if 0 <= pos.x < state.gameMap.width and 0 <= pos.y < state.gameMap.height
    ]


def effect_with_metadata_fields(effect: EffectConfig) -> EffectConfig:
    metadata = dict(effect.metadata)
    for key in ("duration", "delayTurns", "stat", "buffType"):
        value = getattr(effect, key)
        if value is not None:
            metadata[key] = value
    return EffectConfig(
        type=effect.type,
        value=effect.value,
        duration=effect.duration,
        delayTurns=effect.delayTurns,
        stat=effect.stat,
        buffType=effect.buffType,
        metadata=metadata,
    )
