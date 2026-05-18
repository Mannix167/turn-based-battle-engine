from collections.abc import Callable
from uuid import uuid4

from app.game.action_points import consume_ap
from app.game.alliance import add_alliance, remove_alliance
from app.game.damage import apply_damage
from app.game.map_system import assert_empty_valid_cell
from app.game.models import BattleEntity, Direction, GameState, Position, StatusEffect
from app.game.reward import grant_skill
from app.game.skills.skill_template import EffectConfig, SkillTemplate
from app.game.skills.targeting import resolve_targets


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
            "add_permanent_ap": self._add_permanent_ap,
            "add_temporary_ap": self._add_temporary_ap,
            "grant_permanent_ap": self._add_permanent_ap,
            "grant_temporary_ap": self._add_temporary_ap,
            "grant_random_common_skill": self._grant_random_common_skill,
            "extra_turn_next_round": self._extra_turn_next_round,
            "alliance": self._alliance,
            "remove_alliance": self._remove_alliance,
            "delayed_damage": self._delayed_damage,
            "summon": self._summon,
            "grant_skill": self._grant_skill,
        }
        self.target_position: Position | None = None

    def apply(
        self,
        state: GameState,
        caster: BattleEntity,
        template: SkillTemplate,
        target_id: str | None = None,
        target_position: Position | None = None,
        direction: Direction | None = None,
    ) -> None:
        self.target_position = target_position
        state.recentDamagedEntityIds = []
        targets = resolve_targets(state, caster, template, target_id, target_position, direction)
        for effect in template.effects:
            handler = self.handlers.get(effect.type)
            if not handler:
                raise EffectEngineError(f"Effect type is not implemented: {effect.type}")
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
            raise EffectEngineError("Damage effect requires value")
        for target in targets:
            if effect.metadata.get("fixedDamage"):
                amount = 0 if caster.id == target.id else value
                target.currentHp = max(0, target.currentHp - amount)
                if amount > 0:
                    state.recentDamagedEntityIds.append(target.id)
                if target.currentHp <= 0:
                    target.isAlive = False
                    target.statusEffects.clear()
                state.log.append(f"{caster.name}'s effect damaged {target.name} for {amount}")
            else:
                result = apply_damage(caster, target, base_damage=value)
                if result.amount > 0:
                    state.recentDamagedEntityIds.append(target.id)
                state.log.append(f"{caster.name}'s effect damaged {target.name} for {result.amount}")

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
        join_order = max((entity.joinOrder for entity in state.entities.values()), default=0) + 1
        summon = BattleEntity(
            id=f"summon_{uuid4().hex[:10]}",
            type="summon",
            name=metadata.get("name", f"{caster.name}'s Summon"),
            ownerId=caster.id,
            controllerId=caster.controllerId or caster.id,
            x=self.target_position.x,
            y=self.target_position.y,
            maxHp=metadata.get("maxHp", 30),
            currentHp=metadata.get("maxHp", 30),
            baseAttack=metadata.get("baseAttack", 8),
            currentAttack=metadata.get("baseAttack", 8),
            baseDefense=metadata.get("baseDefense", 1),
            currentDefense=metadata.get("baseDefense", 1),
            attackRange=metadata.get("attackRange", 1),
            tempApPerTurn=metadata.get("tempApPerTurn", 1),
            speed=metadata.get("speed", 5),
            critRate=metadata.get("critRate", 0),
            luck=metadata.get("luck", 0),
            joinOrder=join_order,
            activeRound=state.roundNumber + 1,
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
            grant_skill(target, template_id, "random_reward")

    def _grant_random_common_skill(
        self,
        state: GameState,
        caster: BattleEntity,
        targets: list[BattleEntity],
        effect: EffectConfig,
    ) -> None:
        from app.game.reward import grant_random_common_skill

        for target in targets:
            grant_random_common_skill(target)


def use_skill(
    state: GameState,
    caster_id: str,
    skill_instance_id: str,
    template: SkillTemplate,
    target_id: str | None = None,
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
    consume_ap(caster, template.cost)
    EffectEngine().apply(state, caster, template, target_id, target_position, direction)
    caster.skillInstances = [skill for skill in caster.skillInstances if skill.instanceId != skill_instance_id]
    state.log.append(f"{caster.name} used {template.name}")


def _change_stat(entity: BattleEntity, stat: str, value: int) -> None:
    field_name = {
        "attack": "currentAttack",
        "defense": "currentDefense",
        "speed": "speed",
        "luck": "luck",
        "critRate": "critRate",
    }.get(stat)
    if not field_name:
        raise EffectEngineError(f"Unsupported stat: {stat}")
    setattr(entity, field_name, getattr(entity, field_name) + value)
