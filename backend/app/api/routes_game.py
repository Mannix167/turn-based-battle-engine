from dataclasses import asdict
import json
from random import Random
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.game.alliance import are_allies
from app.game import engine
from app.game.fixtures import MAPS, SKILL_TEMPLATES, demo_entity
from app.api.routes_maps import get_map as get_map_template
from app.api.routes_skills import all_templates, get_template_by_id
from app.db.database import get_db
from app.db.models import CharacterRecord, MonsterTemplateRecord
from app.game.damage import calculate_damage
from app.game.distance import manhattan
from app.game.map_system import is_occupied, is_valid_cell, occupied_entity_at
from app.game.models import BattleEntity, Faction, GameMap, GameState, MapCell, Position, TerrainState, TreasureEntity
from app.game.reward import grant_skill
from app.game.terrain import blocks_placement, blocks_random_spawn, damage_destructible_terrain, get_cell, is_walkable, movement_leave_cost, normalize_map_cells
from app.game.turn_queue import end_current_action
from app.schemas.game import (
    ActionPreviewRequest,
    ActionPreviewResponse,
    AttackTerrainRequest,
    BasicAttackRequest,
    ChooseKillRewardRequest,
    CreateGameRequest,
    DigTreasureRequest,
    EndActionRequest,
    GameStateRead,
    MoveRequest,
    PreviewStartResponse,
    StartGameRequest,
    UseSkillRequest,
)


router = APIRouter()
GAMES: dict[str, GameState] = {}


def serialize_state(state: GameState) -> GameStateRead:
    normalize_map_cells(state.gameMap)
    return GameStateRead(
        gameId=state.gameId,
        mapId=state.gameMap.id,
        map={
            "id": state.gameMap.id,
            "name": state.gameMap.name,
            "width": state.gameMap.width,
            "height": state.gameMap.height,
            "cells": [cell_to_schema(cell) for cell in state.gameMap.cells.values()],
        },
        roundNumber=state.roundNumber,
        currentEntityId=state.currentEntityId,
        actionQueue=state.actionQueue,
        entities=[asdict(entity) for entity in state.entities.values()],
        treasures=[{"type": "treasure", **asdict(treasure)} for treasure in state.treasures.values()],
        pendingRewards={key: asdict(value) for key, value in state.pendingRewards.items()},
        factions=[asdict(faction) for faction in state.factions.values()],
        alliances=[asdict(link) for link in state.alliances],
        rewardSkillPoolTemplateIds=state.rewardSkillPoolTemplateIds,
        rewardSkillTemplateRarities=state.rewardSkillTemplateRarities,
        rarityDropWeights=state.rarityDropWeights,
        maxSkillStackQuantity=state.maxSkillStackQuantity,
        startSeed=state.startSeed,
        recentDamageEvents=[asdict(event) for event in state.recentDamageEvents],
        recentEvents=[asdict(event) for event in state.recentEvents],
        isFinished=state.isFinished,
        winnerGroup=state.winnerGroup,
        log=state.log,
    )


def cell_to_schema(cell: MapCell) -> dict:
    data = {
        "x": cell.x,
        "y": cell.y,
        "enabled": cell.enabled,
        "terrainType": cell.terrainType,
        "tileImageUrl": cell.tileImageUrl,
        "terrainState": None,
    }
    if cell.terrainState:
        data["terrainState"] = asdict(cell.terrainState)
    return data


def get_state_or_404(game_id: str) -> GameState:
    state = GAMES.get(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")
    return state


def api_pos(pos: Position) -> dict:
    return {"x": pos.x, "y": pos.y}


@router.post("/create", response_model=GameStateRead, status_code=201)
def create_game(payload: CreateGameRequest) -> GameStateRead:
    game_map = MAPS.get(payload.mapId)
    if not game_map:
        raise HTTPException(status_code=404, detail="Map not found")
    state = engine.create_state(
        game_map,
        [
            demo_entity("p1", "Player One", 0, 0, 1, speed=10),
            demo_entity("p2", "Player Two", 1, 0, 2, speed=8),
        ],
    )
    state.entities["p1"].factionId = "faction_p1"
    state.entities["p2"].factionId = "faction_p2"
    state.factions = {
        "faction_p1": Faction("faction_p1", "Player One", "#22c55e"),
        "faction_p2": Faction("faction_p2", "Player Two", "#3b82f6"),
        "monster": Faction("monster", "怪物", "#ef4444"),
    }
    sync_reward_rarities(state, SKILL_TEMPLATES)
    GAMES[state.gameId] = state
    return serialize_state(state)


@router.post("/preview-start", response_model=PreviewStartResponse)
def preview_start(payload: StartGameRequest, db: Session = Depends(get_db)) -> PreviewStartResponse:
    return build_start_preview(payload, db)


@router.post("/start", response_model=GameStateRead, status_code=201)
def start_game(payload: StartGameRequest, db: Session = Depends(get_db)) -> GameStateRead:
    normalized = normalize_start_payload(payload)
    if not normalized["entity_ids"]:
        raise HTTPException(status_code=400, detail="At least one character is required")
    map_template = get_map_template(normalized["map_id"], db)
    game_map = map_template_to_game_map(map_template)
    factions, faction_assignments = normalize_factions(
        normalized["entity_ids"],
        normalized["factions"],
        normalized["character_faction_assignments"],
    )
    seen_positions: set[Position] = set()
    entities: list[BattleEntity] = []
    fixed_blocking_positions = {
        Position(fixed.x, fixed.y)
        for fixed in map_template.fixedEntities
        if fixed.type == "monster"
    }
    for index, entity_id in enumerate(normalized["entity_ids"], start=1):
        if entity_id not in normalized["positions"]:
            raise HTTPException(status_code=400, detail=f"Missing position for entity: {entity_id}")
        pos = normalized["positions"][entity_id]
        game_pos = Position(pos.x, pos.y)
        if not is_valid_cell(game_map, game_pos):
            raise HTTPException(status_code=400, detail=f"Invalid deployment cell for entity: {entity_id}")
        if blocks_placement(game_map, game_pos):
            raise HTTPException(status_code=400, detail=f"Deployment cell terrain blocks placement: ({pos.x}, {pos.y})")
        if game_pos in seen_positions:
            raise HTTPException(status_code=400, detail=f"Deployment cell is occupied: ({pos.x}, {pos.y})")
        if game_pos in fixed_blocking_positions:
            raise HTTPException(status_code=400, detail=f"Deployment cell is occupied by fixed map content: ({pos.x}, {pos.y})")
        seen_positions.add(game_pos)
        record = db.get(CharacterRecord, entity_id)
        if not record:
            raise HTTPException(status_code=404, detail=f"Character not found: {entity_id}")
        entity = character_record_to_entity(record, pos.x, pos.y, index, normalized["selected_skills"], db)
        entity.factionId = faction_assignments[record.id]
        entities.append(entity)
    state = engine.create_state(game_map, entities)
    state.factions = factions
    preview = build_start_preview(payload, db)
    state.rewardSkillPoolTemplateIds = preview.rewardSkillPoolTemplateIds
    state.rewardSkillTemplateRarities = preview.rewardSkillTemplateRarities
    state.rarityDropWeights = preview.rarityDropWeights
    state.maxSkillStackQuantity = preview.maxSkillStackQuantity
    state.startSeed = preview.startSeed
    add_fixed_map_entities(state, map_template, db)
    add_random_start_entities(state, preview, db)
    GAMES[state.gameId] = state
    return serialize_state(state)


def normalize_start_payload(payload: StartGameRequest) -> dict:
    map_id = payload.mapTemplateId or payload.mapId or "map_default"
    entity_ids = payload.selectedCharacterIds or payload.entityIds or []
    positions = dict(payload.positions)
    for placement in payload.characterPlacements:
        positions[placement.characterId] = placement.position
    selected_skills = payload.selectedCommonSkillIdsByCharacterId or payload.selectedSkillTemplateIds
    return {
        "map_id": map_id,
        "entity_ids": entity_ids,
        "positions": positions,
        "selected_skills": selected_skills,
        "factions": payload.factions,
        "character_faction_assignments": payload.characterFactionAssignments,
    }


def normalize_factions(entity_ids: list[str], payload_factions: list, assignments: dict[str, str]) -> tuple[dict[str, Faction], dict[str, str]]:
    palette = ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444", "#14b8a6"]
    factions: dict[str, Faction] = {
        item.id: Faction(id=item.id, name=item.name, color=item.color, iconUrl=item.iconUrl)
        for item in payload_factions
        if item.id
    }
    normalized_assignments: dict[str, str] = {}
    for index, entity_id in enumerate(entity_ids):
        faction_id = assignments.get(entity_id) or f"faction_{entity_id}"
        if faction_id not in factions:
            factions[faction_id] = Faction(
                id=faction_id,
                name=f"阵营 {index + 1}",
                color=palette[index % len(palette)],
            )
        normalized_assignments[entity_id] = faction_id
    if "monster" not in factions:
        factions["monster"] = Faction(id="monster", name="怪物", color="#ef4444")
    return factions, normalized_assignments


def map_template_to_game_map(map_template) -> GameMap:
    cells: dict[Position, MapCell] = {}
    if map_template.cells:
        for cell in map_template.cells:
            pos = Position(cell.x, cell.y)
            terrain_state = None
            if getattr(cell, "terrainState", None):
                terrain_state = TerrainState(**cell.terrainState.model_dump())
            cells[pos] = MapCell(
                x=cell.x,
                y=cell.y,
                enabled=cell.enabled,
                terrainType=cell.terrainType,
                tileImageUrl=cell.tileImageUrl,
                terrainState=terrain_state,
            )
    game_map = GameMap(
        id=map_template.id,
        name=map_template.name,
        width=map_template.width,
        height=map_template.height,
        validCells={Position(cell.x, cell.y) for cell in map_template.validCells},
        cells=cells,
    )
    normalize_map_cells(game_map)
    return game_map


def build_start_preview(payload: StartGameRequest, db: Session) -> PreviewStartResponse:
    normalized = normalize_start_payload(payload)
    validate_start_skill_payload(normalized, db)
    map_template = get_map_template(normalized["map_id"], db)
    game_map = map_template_to_game_map(map_template)
    seed = payload.startSeed or f"seed_{uuid4().hex[:12]}"
    reward_pool, warnings = resolve_reward_pool(payload.rewardSkillPoolTemplateIds, db)
    templates = all_templates(db)
    monster_pool = resolve_monster_pool(payload.monsterTemplatePoolIds, payload.randomMonsterCount, db)
    rng = Random(seed)
    occupied: set[Position] = set()
    for entity_id, pos in normalized["positions"].items():
        if entity_id in normalized["entity_ids"]:
            occupied.add(Position(pos.x, pos.y))
    for fixed in map_template.fixedEntities:
        occupied.add(Position(fixed.x, fixed.y))
    free_cells = available_random_cells(game_map, occupied)
    required = payload.randomMonsterCount + payload.randomTreasureCount
    if len(free_cells) < required:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "NOT_ENOUGH_FREE_CELLS",
                "message": "可用格子不足，无法生成指定数量的小怪和藏宝点。",
                "freeCellCount": len(free_cells),
                "requiredCellCount": required,
            },
        )
    rng.shuffle(free_cells)
    preview_monsters = []
    for index in range(payload.randomMonsterCount):
        if not monster_pool:
            raise HTTPException(status_code=400, detail={"error": "NO_AVAILABLE_MONSTER_TEMPLATE"})
        pos = free_cells.pop(0)
        template_id = rng.choice(monster_pool).id
        preview_monsters.append(
            {
                "id": f"random_monster_{index + 1}",
                "monsterTemplateId": template_id,
                "position": {"x": pos.x, "y": pos.y},
            }
        )
    preview_treasures = []
    for index in range(payload.randomTreasureCount):
        pos = free_cells.pop(0)
        preview_treasures.append(
            {
                "id": f"random_treasure_{index + 1}",
                "position": {"x": pos.x, "y": pos.y},
            }
        )
    if payload.randomMonsterCount > 0 and not payload.monsterTemplatePoolIds:
        warnings.append("小怪池为空，已默认使用全部启用小怪。")
    if not payload.rewardSkillPoolTemplateIds:
        warnings.append("奖励池为空，已默认使用全部可奖励通用技能。")
    if not reward_pool:
        warnings.append("奖励池为空，击杀小怪和挖宝不会获得技能。")
    return PreviewStartResponse(
        startSeed=seed,
        previewMonsters=preview_monsters,
        previewTreasures=preview_treasures,
        rewardSkillPoolTemplateIds=reward_pool,
        rewardSkillTemplateRarities={
            template_id: templates[template_id].rarity
            for template_id in reward_pool
            if template_id in templates
        },
        rarityDropWeights={
            "common": 50,
            "rare": 25,
            "uncommon": 15,
            "epic": 8,
            "legendary": 2,
        },
        maxSkillStackQuantity=3,
        warnings=warnings,
    )


def validate_start_skill_payload(normalized: dict, db: Session) -> None:
    for character_id in normalized["entity_ids"]:
        record = db.get(CharacterRecord, character_id)
        if record:
            validate_selected_common_skills(record, normalized["selected_skills"].get(character_id, []), db)


def available_random_cells(game_map: GameMap, occupied: set[Position]) -> list[Position]:
    positions: list[Position] = []
    normalize_map_cells(game_map)
    for y in range(game_map.height):
        for x in range(game_map.width):
            pos = Position(x, y)
            if not blocks_random_spawn(game_map, pos) and pos not in occupied:
                positions.append(pos)
    return positions


def resolve_monster_pool(
    requested_ids: list[str],
    random_monster_count: int,
    db: Session,
) -> list[MonsterTemplateRecord]:
    query = db.query(MonsterTemplateRecord).filter(
        MonsterTemplateRecord.enabled == 1,
        MonsterTemplateRecord.can_spawn_as_monster == 1,
    )
    records = query.all()
    if requested_ids:
        requested = set(requested_ids)
        records = [record for record in records if record.id in requested]
    if random_monster_count > 0 and not records:
        raise HTTPException(status_code=400, detail={"error": "NO_AVAILABLE_MONSTER_TEMPLATE"})
    return records


def resolve_reward_pool(requested_ids: list[str], db: Session) -> tuple[list[str], list[str]]:
    templates = all_templates(db)
    if requested_ids:
        return [
            template_id
            for template_id in requested_ids
            if (template := templates.get(template_id)) and template.enabled and (
                "common" in template.usableAs or "reward" in template.usableAs
            )
        ], []
    pool = [
        template.id
        for template in templates.values()
        if template.enabled and ("common" in template.usableAs or "reward" in template.usableAs)
    ]
    return pool, []


def sync_reward_rarities(state: GameState, templates: dict) -> None:
    state.rewardSkillTemplateRarities = {
        template_id: getattr(template, "rarity", "common")
        for template_id, template in templates.items()
        if template_id in state.rewardSkillPoolTemplateIds
    }


def character_record_to_entity(
    record: CharacterRecord,
    x: int,
    y: int,
    join_order: int,
    selected_skill_template_ids: dict[str, list[str]],
    db: Session,
) -> BattleEntity:
    entity = BattleEntity(
        id=record.id,
        type="character",
        name=record.name,
        x=x,
        y=y,
        maxHp=record.max_hp,
        currentHp=record.max_hp,
        baseAttack=record.base_attack,
        currentAttack=record.base_attack,
        baseDefense=record.base_defense,
        currentDefense=record.base_defense,
        attackRange=record.attack_range,
        tempApPerTurn=record.temp_ap_per_turn,
        speed=record.speed,
        critRate=record.crit_rate,
        luck=record.luck,
        joinOrder=join_order,
    )
    default_template_ids = json.loads(record.default_skill_template_ids or "[]")
    selected_template_ids = selected_skill_template_ids.get(record.id, [])
    validate_selected_common_skills(record, selected_template_ids, db)
    for source, template_ids in (
        ("character_default", default_template_ids),
        ("start_common", selected_template_ids),
    ):
        for template_id in template_ids:
            template = get_template_by_id(template_id, db)
            if not template or not template.enabled:
                continue
            if source == "character_default" and "character" not in template.usableAs:
                continue
            if source == "start_common" and "common" not in template.usableAs:
                continue
            grant_skill(entity, template_id, source, max_quantity=3)
    return entity


def validate_selected_common_skills(
    record: CharacterRecord,
    selected_template_ids: list[str],
    db: Session,
) -> None:
    counts: dict[str, int] = {}
    total_cost = 0
    capacity = record.skill_point_capacity if record.skill_point_capacity is not None else 3
    for template_id in selected_template_ids:
        template = get_template_by_id(template_id, db)
        if not template or not template.enabled or "common" not in template.usableAs:
            raise HTTPException(status_code=400, detail=f"Skill cannot be used as start common skill: {template_id}")
        counts[template_id] = counts.get(template_id, 0) + 1
        if counts[template_id] > 3:
            raise HTTPException(status_code=400, detail=f"Skill stack exceeds max quantity: {template_id}")
        total_cost += max(0, template.skillPointCost)
    if total_cost > capacity:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "SKILL_POINT_CAPACITY_EXCEEDED",
                "characterId": record.id,
                "usedSkillPoints": total_cost,
                "skillPointCapacity": capacity,
            },
        )


def monster_record_to_entity(
    record: MonsterTemplateRecord,
    entity_id: str,
    x: int,
    y: int,
    join_order: int,
) -> BattleEntity:
    return BattleEntity(
        id=entity_id,
        type="monster",
        templateId=record.id,
        name=record.name,
        x=x,
        y=y,
        maxHp=record.max_hp,
        currentHp=record.max_hp,
        baseAttack=record.base_attack,
        currentAttack=record.base_attack,
        baseDefense=record.base_defense,
        currentDefense=record.base_defense,
        attackRange=record.attack_range,
        tempApPerTurn=0,
        speed=record.speed,
        critRate=record.crit_rate,
        luck=record.luck,
        joinOrder=join_order,
        tokenImageUrl=record.token_image_url,
        portraitImageUrl=record.portrait_image_url,
        factionId="monster",
    )


def add_fixed_map_entities(state: GameState, map_template, db: Session) -> None:
    next_join = max((entity.joinOrder for entity in state.entities.values()), default=0) + 1
    for fixed in map_template.fixedEntities:
        if fixed.type == "treasure":
            state.treasures[fixed.id] = TreasureEntity(id=fixed.id, name=fixed.templateId or "Treasure", x=fixed.x, y=fixed.y)
        elif fixed.type == "monster":
            record = db.get(MonsterTemplateRecord, fixed.templateId or "")
            if not record or not record.enabled or not record.can_spawn_as_monster:
                record = db.query(MonsterTemplateRecord).filter(
                    MonsterTemplateRecord.enabled == 1,
                    MonsterTemplateRecord.can_spawn_as_monster == 1,
                ).first()
            if not record:
                raise HTTPException(status_code=400, detail="NO_AVAILABLE_MONSTER_TEMPLATE")
            monster = monster_record_to_entity(record, fixed.id, fixed.x, fixed.y, next_join)
            next_join += 1
            state.entities[monster.id] = monster


def add_random_start_entities(state: GameState, preview: PreviewStartResponse, db: Session) -> None:
    next_join = max((entity.joinOrder for entity in state.entities.values()), default=0) + 1
    for item in preview.previewMonsters:
        record = db.get(MonsterTemplateRecord, item.monsterTemplateId)
        if not record or not record.enabled:
            raise HTTPException(status_code=400, detail="NO_AVAILABLE_MONSTER_TEMPLATE")
        monster = monster_record_to_entity(
            record,
            item.id,
            item.position.x,
            item.position.y,
            next_join,
        )
        next_join += 1
        state.entities[monster.id] = monster
    for item in preview.previewTreasures:
        state.treasures[item.id] = TreasureEntity(
            id=item.id,
            name="Treasure",
            x=item.position.x,
            y=item.position.y,
        )


@router.get("/{game_id}", response_model=GameStateRead)
def get_game(game_id: str) -> GameStateRead:
    return serialize_state(get_state_or_404(game_id))


@router.post("/action-preview", response_model=ActionPreviewResponse)
def action_preview(payload: ActionPreviewRequest, db: Session = Depends(get_db)) -> ActionPreviewResponse:
    state = get_state_or_404(payload.gameId)
    if payload.gameId != state.gameId:
        raise HTTPException(status_code=400, detail="Game id mismatch")
    actor = state.entities.get(payload.actorId)
    if not actor:
        return ActionPreviewResponse(valid=False, actionType=payload.actionType, reason="Actor not found")
    if state.currentEntityId != actor.id:
        return ActionPreviewResponse(valid=False, actionType=payload.actionType, reason="It is not this entity's action")
    if not actor.isAlive:
        return ActionPreviewResponse(valid=False, actionType=payload.actionType, reason="Actor is not alive")

    if payload.actionType == "move":
        return preview_move(state, actor, payload)
    if payload.actionType == "attack":
        return preview_attack(state, actor, payload)
    if payload.actionType == "dig":
        return preview_dig(state, actor, payload)
    if payload.actionType == "skill":
        return preview_skill(state, actor, payload, db)
    return ActionPreviewResponse(valid=False, actionType=payload.actionType, reason="Unsupported action")


def ap_cost_response(actor: BattleEntity, total_cost: int) -> dict:
    temporary = min(max(actor.temporaryAP, 0), total_cost)
    permanent = max(0, total_cost - temporary)
    return {"temporaryAp": temporary, "permanentAp": permanent, "total": total_cost}


def preview_move(state: GameState, actor: BattleEntity, payload: ActionPreviewRequest) -> ActionPreviewResponse:
    if engine.has_status(actor, "root"):
        return ActionPreviewResponse(valid=False, actionType="move", reason="Entity is rooted and cannot move")
    if payload.targetPosition is None:
        return ActionPreviewResponse(valid=False, actionType="move", reason="Missing target position")
    target = Position(payload.targetPosition.x, payload.targetPosition.y)
    cost = movement_leave_cost(state.gameMap, actor.position)
    if manhattan(actor.position, target) != 1:
        return ActionPreviewResponse(valid=False, actionType="move", reason="Only one-cell movement is supported", apCost=ap_cost_response(actor, cost))
    if not is_valid_cell(state.gameMap, target) or not is_walkable(state.gameMap, target):
        return ActionPreviewResponse(valid=False, actionType="move", reason="Target cell is not walkable", apCost=ap_cost_response(actor, cost))
    if is_occupied(state, target):
        return ActionPreviewResponse(valid=False, actionType="move", reason="Target cell is occupied", apCost=ap_cost_response(actor, cost))
    if actor.temporaryAP + actor.permanentAP < cost:
        return ActionPreviewResponse(valid=False, actionType="move", reason="Not enough AP", apCost=ap_cost_response(actor, cost))
    return ActionPreviewResponse(valid=True, actionType="move", apCost=ap_cost_response(actor, cost), affectedPositions=[api_pos(target)])


def damage_preview_item(source: BattleEntity, target: BattleEntity, *, base_damage: int | None = None) -> dict:
    result = calculate_damage(source, target, base_damage=base_damage)
    crit_raw = int((source.currentAttack if base_damage is None else base_damage) * 1.5)
    crit_damage = max(1, crit_raw - target.currentDefense)
    return {
        "targetEntityId": target.id,
        "targetName": target.name,
        "damageType": "normal",
        "finalDamage": min(target.currentHp, result.amount),
        "baseDamage": source.currentAttack if base_damage is None else base_damage,
        "defenseReduction": target.currentDefense,
        "canCrit": True,
        "critRate": source.critRate,
        "critDamagePreview": min(target.currentHp, crit_damage),
        "willKill": result.amount >= target.currentHp,
    }


def preview_attack(state: GameState, actor: BattleEntity, payload: ActionPreviewRequest) -> ActionPreviewResponse:
    if actor.temporaryAP + actor.permanentAP < 1:
        return ActionPreviewResponse(valid=False, actionType="attack", reason="Not enough AP", apCost=ap_cost_response(actor, 1))
    if payload.targetEntityId:
        target = state.entities.get(payload.targetEntityId)
        if not target:
            return ActionPreviewResponse(valid=False, actionType="attack", reason="Target not found", apCost=ap_cost_response(actor, 1))
        if not target.isAlive:
            return ActionPreviewResponse(valid=False, actionType="attack", reason="Target is not alive", apCost=ap_cost_response(actor, 1))
        if actor.id == target.id:
            return ActionPreviewResponse(valid=False, actionType="attack", reason="Cannot attack yourself", apCost=ap_cost_response(actor, 1))
        if are_allies(state, actor, target):
            return ActionPreviewResponse(valid=False, actionType="attack", reason="Cannot attack an ally", apCost=ap_cost_response(actor, 1))
        if manhattan(actor.position, target.position) > actor.attackRange:
            return ActionPreviewResponse(valid=False, actionType="attack", reason="Target is out of attack range", apCost=ap_cost_response(actor, 1))
        counter = None
        if target.type == "monster" and manhattan(target.position, actor.position) <= target.attackRange:
            counter = damage_preview_item(target, actor)
        damage_item = damage_preview_item(actor, target)
        return ActionPreviewResponse(
            valid=True,
            actionType="attack",
            apCost=ap_cost_response(actor, 1),
            damagePreviews=[damage_item],
            counterAttackPreview=counter,
            killPreview={"willKill": damage_item["willKill"], "killedEntityIds": [target.id] if damage_item["willKill"] else []},
            affectedPositions=[api_pos(target.position)],
        )
    if payload.targetPosition:
        pos = Position(payload.targetPosition.x, payload.targetPosition.y)
        cell = get_cell(state.gameMap, pos)
        if not cell or cell.terrainType != "wood_stake":
            return ActionPreviewResponse(valid=False, actionType="attack", reason="No destructible terrain at target", apCost=ap_cost_response(actor, 1))
        if manhattan(actor.position, pos) > actor.attackRange:
            return ActionPreviewResponse(valid=False, actionType="attack", reason="Target terrain is out of range", apCost=ap_cost_response(actor, 1))
        hp = cell.terrainState.hp if cell.terrainState and cell.terrainState.hp is not None else 10
        defense = cell.terrainState.defense if cell.terrainState and cell.terrainState.defense is not None else 0
        amount = max(1, actor.currentAttack - defense)
        return ActionPreviewResponse(
            valid=True,
            actionType="attack",
            apCost=ap_cost_response(actor, 1),
            terrainPreviews=[{"position": api_pos(pos), "terrainType": cell.terrainType, "value": min(hp, amount)}],
            affectedPositions=[api_pos(pos)],
            killPreview={"willKill": amount >= hp, "killedEntityIds": []},
        )
    return ActionPreviewResponse(valid=False, actionType="attack", reason="Missing target", apCost=ap_cost_response(actor, 1))


def preview_dig(state: GameState, actor: BattleEntity, payload: ActionPreviewRequest) -> ActionPreviewResponse:
    if actor.temporaryAP + actor.permanentAP < 1:
        return ActionPreviewResponse(valid=False, actionType="dig", reason="Not enough AP", apCost=ap_cost_response(actor, 1))
    if payload.targetPosition is None:
        return ActionPreviewResponse(valid=False, actionType="dig", reason="Missing treasure position", apCost=ap_cost_response(actor, 1))
    pos = Position(payload.targetPosition.x, payload.targetPosition.y)
    treasure = next((item for item in state.treasures.values() if not item.isDug and item.x == pos.x and item.y == pos.y), None)
    if not treasure:
        return ActionPreviewResponse(valid=False, actionType="dig", reason="No treasure at target", apCost=ap_cost_response(actor, 1))
    if manhattan(actor.position, pos) > actor.attackRange:
        return ActionPreviewResponse(valid=False, actionType="dig", reason="Treasure is out of attack range", apCost=ap_cost_response(actor, 1))
    success = max(0, min(100, actor.luck))
    return ActionPreviewResponse(
        valid=True,
        actionType="dig",
        apCost=ap_cost_response(actor, 1),
        digPreview={"successRate": success, "failNoEffectRate": 50, "failDamageRate": 50, "failDamageValue": 10},
        affectedPositions=[api_pos(pos)],
    )


def preview_skill(state: GameState, actor: BattleEntity, payload: ActionPreviewRequest, db: Session) -> ActionPreviewResponse:
    if engine.has_status(actor, "silence"):
        return ActionPreviewResponse(valid=False, actionType="skill", reason="Entity is silenced and cannot use skills")
    if not payload.skillInstanceId:
        return ActionPreviewResponse(valid=False, actionType="skill", reason="Missing skill instance")
    instance = next((skill for skill in actor.skillInstances if skill.instanceId == payload.skillInstanceId), None)
    if not instance:
        return ActionPreviewResponse(valid=False, actionType="skill", reason="Skill instance not found")
    if instance.quantity <= 0:
        return ActionPreviewResponse(valid=False, actionType="skill", reason="Skill stack is empty")
    template = get_template_by_id(instance.templateId, db)
    if not template:
        return ActionPreviewResponse(valid=False, actionType="skill", reason="Skill template not found")
    if not template.enabled:
        return ActionPreviewResponse(valid=False, actionType="skill", reason="Skill template is disabled")
    if actor.temporaryAP + actor.permanentAP < template.cost:
        return ActionPreviewResponse(valid=False, actionType="skill", reason="Not enough AP", apCost=ap_cost_response(actor, template.cost))
    affected: list[dict] = []
    damage_items: list[dict] = []
    if payload.targetEntityId:
        target = state.entities.get(payload.targetEntityId)
        if not target:
            return ActionPreviewResponse(valid=False, actionType="skill", reason="Target not found", apCost=ap_cost_response(actor, template.cost))
        if manhattan(actor.position, target.position) > template.range:
            return ActionPreviewResponse(valid=False, actionType="skill", reason="Target is out of skill range", apCost=ap_cost_response(actor, template.cost))
        affected.append(api_pos(target.position))
        damage_effect = next((effect for effect in template.effects if effect.type in {"damage", "random_damage"}), None)
        if damage_effect:
            damage_items.append(damage_preview_item(actor, target, base_damage=damage_effect.value))
    elif payload.targetPosition:
        target = Position(payload.targetPosition.x, payload.targetPosition.y)
        if manhattan(actor.position, target) > template.range:
            return ActionPreviewResponse(valid=False, actionType="skill", reason="Target cell is out of skill range", apCost=ap_cost_response(actor, template.cost))
        affected.append(api_pos(target))
    return ActionPreviewResponse(
        valid=True,
        actionType="skill",
        apCost=ap_cost_response(actor, template.cost),
        damagePreviews=damage_items,
        affectedPositions=affected,
    )


@router.post("/{game_id}/move", response_model=GameStateRead)
def move(game_id: str, payload: MoveRequest) -> GameStateRead:
    state = get_state_or_404(game_id)
    try:
        engine.move(state, payload.entityId, Position(payload.to.x, payload.to.y))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_state(state)


@router.post("/{game_id}/basic-attack", response_model=GameStateRead)
def basic_attack(game_id: str, payload: BasicAttackRequest) -> GameStateRead:
    state = get_state_or_404(game_id)
    try:
        engine.basic_attack(state, payload.attackerId, payload.targetId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_state(state)


@router.post("/{game_id}/attack-terrain", response_model=GameStateRead)
def attack_terrain(game_id: str, payload: AttackTerrainRequest) -> GameStateRead:
    state = get_state_or_404(game_id)
    try:
        engine.basic_attack_terrain(
            state,
            payload.attackerId,
            Position(payload.targetCell.x, payload.targetCell.y),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_state(state)


@router.post("/{game_id}/end-action", response_model=GameStateRead)
def end_action(game_id: str, payload: EndActionRequest) -> GameStateRead:
    state = get_state_or_404(game_id)
    try:
        end_current_action(state, payload.entityId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_state(state)


@router.post("/{game_id}/use-skill", response_model=GameStateRead)
def use_skill(game_id: str, payload: UseSkillRequest, db: Session = Depends(get_db)) -> GameStateRead:
    state = get_state_or_404(game_id)
    try:
        instance = next(
            skill
            for skill in state.entities[payload.casterId].skillInstances
            if skill.instanceId == payload.skillInstanceId
        )
        template = get_template_by_id(instance.templateId, db)
        if not template or not template.enabled:
            raise KeyError(instance.templateId)
        template = hydrate_summon_effects(template, db)
        target_position = (
            Position(payload.targetCell.x, payload.targetCell.y) if payload.targetCell is not None else None
        )
        engine.use_skill(
            state,
            payload.casterId,
            payload.skillInstanceId,
            template,
            target_id=payload.targetEntityId,
            second_target_id=payload.secondTargetEntityId,
            target_position=target_position,
            direction=payload.direction,
        )
    except (StopIteration, KeyError):
        raise HTTPException(status_code=404, detail="Skill instance or template not found") from None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_state(state)


def hydrate_summon_effects(template, db: Session):
    for effect in template.effects:
        if effect.type != "summon":
            continue
        creature_id = effect.metadata.get("creatureTemplateId")
        if not creature_id:
            continue
        record = db.get(MonsterTemplateRecord, creature_id)
        if not record or not record.enabled or not record.can_be_summoned:
            raise HTTPException(status_code=400, detail="Creature cannot be summoned")
        effect.metadata["creatureTemplate"] = {
            "id": record.id,
            "name": record.name,
            "maxHp": record.max_hp,
            "baseAttack": record.base_attack,
            "baseDefense": record.base_defense,
            "attackRange": record.attack_range,
            "tempApPerTurn": record.temp_ap_per_turn,
            "speed": record.speed,
            "critRate": record.crit_rate,
            "luck": record.luck,
            "tokenImageUrl": record.token_image_url,
            "portraitImageUrl": record.portrait_image_url,
            "summonSkillTemplateIds": json.loads(record.summon_skill_template_ids or "[]"),
        }
    return template


@router.post("/{game_id}/dig-treasure", response_model=GameStateRead)
def dig_treasure(game_id: str, payload: DigTreasureRequest) -> GameStateRead:
    state = get_state_or_404(game_id)
    try:
        engine.dig_treasure(state, payload.entityId, payload.treasureId, payload.failureDamage)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_state(state)


@router.post("/{game_id}/choose-kill-reward", response_model=GameStateRead)
def choose_kill_reward(game_id: str, payload: ChooseKillRewardRequest) -> GameStateRead:
    state = get_state_or_404(game_id)
    try:
        engine.choose_kill_reward(state, payload.killerId, payload.templateId)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return serialize_state(state)
