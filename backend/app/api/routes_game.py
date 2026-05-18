from dataclasses import asdict

from fastapi import APIRouter, HTTPException

from app.game import engine
from app.game.fixtures import MAPS, demo_entity
from app.game.fixtures import SKILL_TEMPLATES
from app.game.models import BattleEntity, GameState, Position
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
        roundNumber=state.roundNumber,
        currentEntityId=state.currentEntityId,
        actionQueue=state.actionQueue,
        entities=[asdict(entity) for entity in state.entities.values()],
        treasures=[{"type": "treasure", **asdict(treasure)} for treasure in state.treasures.values()],
        pendingRewards={key: asdict(value) for key, value in state.pendingRewards.items()},
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
def start_game(payload: StartGameRequest) -> GameStateRead:
    game_map = MAPS.get(payload.mapId)
    if not game_map:
        raise HTTPException(status_code=404, detail="Map not found")
    entities: list[BattleEntity] = []
    for index, entity_id in enumerate(payload.entityIds, start=1):
        pos = payload.positions[entity_id]
        entities.append(demo_entity(entity_id, entity_id, pos.x, pos.y, index, speed=10))
    state = engine.create_state(game_map, entities)
    GAMES[state.gameId] = state
    return serialize_state(state)


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
def use_skill(game_id: str, payload: UseSkillRequest) -> GameStateRead:
    state = get_state_or_404(game_id)
    try:
        instance = next(
            skill
            for skill in state.entities[payload.casterId].skillInstances
            if skill.instanceId == payload.skillInstanceId
        )
        template = SKILL_TEMPLATES[instance.templateId]
        target_position = (
            Position(payload.targetCell.x, payload.targetCell.y) if payload.targetCell is not None else None
        )
        engine.use_skill(
            state,
            payload.casterId,
            payload.skillInstanceId,
            template,
            target_id=payload.targetEntityId,
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
