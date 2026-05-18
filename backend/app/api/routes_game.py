from dataclasses import asdict
import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.game import engine
from app.game.fixtures import MAPS, demo_entity
from app.api.routes_maps import get_map as get_map_template
from app.api.routes_skills import get_template_by_id
from app.db.database import get_db
from app.db.models import CharacterRecord
from app.game.map_system import is_valid_cell
from app.game.models import BattleEntity, GameMap, GameState, Position, SkillInstance, TreasureEntity
from app.game.turn_queue import end_current_action
from app.schemas.game import (
    BasicAttackRequest,
    ChooseKillRewardRequest,
    CreateGameRequest,
    DigTreasureRequest,
    EndActionRequest,
    GameStateRead,
    MoveRequest,
    StartGameRequest,
    UseSkillRequest,
)


router = APIRouter()
GAMES: dict[str, GameState] = {}


def serialize_state(state: GameState) -> GameStateRead:
    return GameStateRead(
        gameId=state.gameId,
        mapId=state.gameMap.id,
        roundNumber=state.roundNumber,
        currentEntityId=state.currentEntityId,
        actionQueue=state.actionQueue,
        entities=[asdict(entity) for entity in state.entities.values()],
        treasures=[{"type": "treasure", **asdict(treasure)} for treasure in state.treasures.values()],
        pendingRewards={key: asdict(value) for key, value in state.pendingRewards.items()},
        recentDamageEvents=[asdict(event) for event in state.recentDamageEvents],
        isFinished=state.isFinished,
        winnerGroup=state.winnerGroup,
        log=state.log,
    )


def get_state_or_404(game_id: str) -> GameState:
    state = GAMES.get(game_id)
    if not state:
        raise HTTPException(status_code=404, detail="Game not found")
    return state


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
    GAMES[state.gameId] = state
    return serialize_state(state)


@router.post("/start", response_model=GameStateRead, status_code=201)
def start_game(payload: StartGameRequest, db: Session = Depends(get_db)) -> GameStateRead:
    map_template = get_map_template(payload.mapId, db)
    game_map = GameMap(
        id=map_template.id,
        name=map_template.name,
        width=map_template.width,
        height=map_template.height,
        validCells={Position(cell.x, cell.y) for cell in map_template.validCells},
    )
    seen_positions: set[Position] = set()
    entities: list[BattleEntity] = []
    fixed_blocking_positions = {
        Position(fixed.x, fixed.y)
        for fixed in map_template.fixedEntities
        if fixed.type == "monster"
    }
    for index, entity_id in enumerate(payload.entityIds, start=1):
        if entity_id not in payload.positions:
            raise HTTPException(status_code=400, detail=f"Missing position for entity: {entity_id}")
        pos = payload.positions[entity_id]
        game_pos = Position(pos.x, pos.y)
        if not is_valid_cell(game_map, game_pos):
            raise HTTPException(status_code=400, detail=f"Invalid deployment cell for entity: {entity_id}")
        if game_pos in seen_positions:
            raise HTTPException(status_code=400, detail=f"Deployment cell is occupied: ({pos.x}, {pos.y})")
        if game_pos in fixed_blocking_positions:
            raise HTTPException(status_code=400, detail=f"Deployment cell has a monster: ({pos.x}, {pos.y})")
        seen_positions.add(game_pos)
        record = db.get(CharacterRecord, entity_id)
        if not record:
            raise HTTPException(status_code=404, detail=f"Character not found: {entity_id}")
        entities.append(character_record_to_entity(record, pos.x, pos.y, index, payload.selectedSkillTemplateIds, db))
    state = engine.create_state(game_map, entities)
    add_fixed_map_entities(state, map_template)
    GAMES[state.gameId] = state
    return serialize_state(state)


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
    for source, template_ids in (
        ("character_default", default_template_ids),
        ("start_common", selected_template_ids),
    ):
        for offset, template_id in enumerate(template_ids, start=1):
            template = get_template_by_id(template_id, db)
            if not template or not template.enabled:
                continue
            if source == "character_default" and "character" not in template.usableAs:
                continue
            if source == "start_common" and "common" not in template.usableAs:
                continue
            entity.skillInstances.append(
                SkillInstance(
                    instanceId=f"{record.id}_{template_id}_{source}_{offset}",
                    templateId=template_id,
                    source=source,
                )
            )
    return entity


def add_fixed_map_entities(state: GameState, map_template) -> None:
    next_join = max((entity.joinOrder for entity in state.entities.values()), default=0) + 1
    for fixed in map_template.fixedEntities:
        if fixed.type == "treasure":
            state.treasures[fixed.id] = TreasureEntity(id=fixed.id, name=fixed.templateId or "Treasure", x=fixed.x, y=fixed.y)
        elif fixed.type == "monster":
            monster = BattleEntity(
                id=fixed.id,
                type="monster",
                name=fixed.templateId or "Monster",
                x=fixed.x,
                y=fixed.y,
                maxHp=30,
                currentHp=30,
                baseAttack=8,
                currentAttack=8,
                baseDefense=1,
                currentDefense=1,
                attackRange=1,
                tempApPerTurn=0,
                speed=0,
                critRate=0,
                luck=0,
                joinOrder=next_join,
            )
            next_join += 1
            state.entities[monster.id] = monster


@router.get("/{game_id}", response_model=GameStateRead)
def get_game(game_id: str) -> GameStateRead:
    return serialize_state(get_state_or_404(game_id))


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
