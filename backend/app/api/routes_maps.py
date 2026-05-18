from fastapi import APIRouter, HTTPException

from app.game.fixtures import MAPS
from app.game.models import GameMap, Position
from app.schemas.map import MapCreate, MapRead


router = APIRouter()
CUSTOM_MAPS: dict[str, GameMap] = {}


def to_schema(game_map: GameMap) -> MapRead:
    cells = sorted(game_map.validCells, key=lambda pos: (pos.y, pos.x))
    return MapRead(
        id=game_map.id,
        name=game_map.name,
        width=game_map.width,
        height=game_map.height,
        validCells=[{"x": pos.x, "y": pos.y} for pos in cells],
    )


def all_maps() -> dict[str, GameMap]:
    return {**MAPS, **CUSTOM_MAPS}


@router.get("", response_model=list[MapRead])
def list_maps() -> list[MapRead]:
    return [to_schema(game_map) for game_map in all_maps().values()]


@router.get("/{map_id}", response_model=MapRead)
def get_map(map_id: str) -> MapRead:
    game_map = all_maps().get(map_id)
    if not game_map:
        raise HTTPException(status_code=404, detail="Map not found")
    return to_schema(game_map)


@router.post("", response_model=MapRead, status_code=201)
def create_map(payload: MapCreate) -> MapRead:
    map_id = payload.id or f"map_{len(CUSTOM_MAPS) + 1}"
    game_map = GameMap(
        id=map_id,
        name=payload.name,
        width=payload.width,
        height=payload.height,
        validCells={Position(cell.x, cell.y) for cell in payload.validCells},
    )
    CUSTOM_MAPS[map_id] = game_map
    return to_schema(game_map)


@router.put("/{map_id}", response_model=MapRead)
def update_map(map_id: str, payload: MapCreate) -> MapRead:
    if map_id not in all_maps():
        raise HTTPException(status_code=404, detail="Map not found")
    game_map = GameMap(
        id=map_id,
        name=payload.name,
        width=payload.width,
        height=payload.height,
        validCells={Position(cell.x, cell.y) for cell in payload.validCells},
    )
    CUSTOM_MAPS[map_id] = game_map
    return to_schema(game_map)
