import json
from datetime import UTC, datetime
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.models import MapRecord
from app.game.fixtures import MAPS
from app.game.models import GameMap, Position
from app.schemas.map import MapCreate, MapRead, MapValidationResult


router = APIRouter()


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def builtin_map_to_schema(game_map: GameMap) -> MapRead:
    valid_cells = sorted(game_map.validCells, key=lambda pos: (pos.y, pos.x))
    cells = [
        {"x": x, "y": y, "enabled": not game_map.validCells or Position(x, y) in game_map.validCells}
        for y in range(game_map.height)
        for x in range(game_map.width)
    ]
    return MapRead(
        id=game_map.id,
        name=game_map.name,
        description="Built-in map",
        width=game_map.width,
        height=game_map.height,
        cells=cells,
        validCells=[{"x": pos.x, "y": pos.y} for pos in valid_cells],
        spawnZones=[],
        fixedEntities=[],
        randomRules=[],
        backgroundImageUrl=None,
        createdAt="built-in",
        updatedAt="built-in",
    )


def record_to_schema(record: MapRecord) -> MapRead:
    cells = json.loads(record.cells_json or "[]")
    valid_cells = [{"x": cell["x"], "y": cell["y"]} for cell in cells if cell.get("enabled", True)]
    return MapRead(
        id=record.id,
        name=record.name,
        description=record.description,
        width=record.width,
        height=record.height,
        cells=cells,
        validCells=valid_cells,
        spawnZones=json.loads(record.spawn_zones_json or "[]"),
        fixedEntities=json.loads(record.fixed_entities_json or "[]"),
        randomRules=json.loads(record.random_rules_json or "[]"),
        backgroundImageUrl=record.background_image_url,
        createdAt=record.created_at,
        updatedAt=record.updated_at,
    )


def payload_to_record(record: MapRecord, payload: MapCreate) -> None:
    stamp = now_iso()
    cells = [cell.model_dump() for cell in payload.cells]
    if not cells:
        valid = {(cell.x, cell.y) for cell in payload.validCells}
        cells = [
            {"x": x, "y": y, "enabled": not valid or (x, y) in valid, "terrainType": "normal", "tileImageUrl": None}
            for y in range(payload.height)
            for x in range(payload.width)
        ]
    record.name = payload.name
    record.description = payload.description
    record.width = payload.width
    record.height = payload.height
    record.cells_json = json.dumps(cells)
    record.spawn_zones_json = json.dumps([zone.model_dump() for zone in payload.spawnZones])
    record.fixed_entities_json = json.dumps([entity.model_dump() for entity in payload.fixedEntities])
    record.random_rules_json = json.dumps([rule.model_dump() for rule in payload.randomRules])
    record.background_image_url = payload.backgroundImageUrl
    record.updated_at = stamp
    if not record.created_at:
        record.created_at = stamp


def validate_map_payload(payload: MapCreate) -> MapValidationResult:
    errors: list[str] = []
    warnings: list[str] = []
    cells = payload.cells
    if not cells:
        cells = [
            type("Cell", (), {"x": cell.x, "y": cell.y, "enabled": True})()
            for cell in payload.validCells
        ]
    enabled = {(cell.x, cell.y) for cell in cells if cell.enabled}
    if not enabled:
        errors.append("At least one enabled cell is required")
    for x, y in enabled:
        if x < 0 or y < 0 or x >= payload.width or y >= payload.height:
            errors.append(f"Enabled cell out of bounds: ({x}, {y})")
    occupied: set[tuple[int, int]] = set()
    for entity in payload.fixedEntities:
        pos = (entity.x, entity.y)
        if pos not in enabled:
            errors.append(f"Fixed {entity.type} must be on enabled cell: ({entity.x}, {entity.y})")
        if pos in occupied:
            errors.append(f"Fixed entities overlap at ({entity.x}, {entity.y})")
        occupied.add(pos)
    for zone in payload.spawnZones:
        for cell in zone.cells:
            if (cell.x, cell.y) not in enabled:
                errors.append(f"Spawn zone cell must be enabled: ({cell.x}, {cell.y})")
    for rule in payload.randomRules:
        allowed = {(cell.x, cell.y) for cell in rule.allowedCells} if rule.allowedCells else enabled
        excluded = {(cell.x, cell.y) for cell in rule.excludedCells}
        available = [cell for cell in allowed if cell in enabled and cell not in excluded and cell not in occupied]
        if rule.count > len(available):
            errors.append(f"Random rule {rule.id} count exceeds available cells")
    if payload.spawnZones:
        player_cells = sum(len(zone.cells) for zone in payload.spawnZones if zone.type == "player")
        if player_cells < 2:
            warnings.append("Player spawn zone has fewer than 2 cells")
    return MapValidationResult(isValid=not errors, errors=errors, warnings=warnings)


def all_maps(db: Session) -> list[MapRead]:
    maps = [builtin_map_to_schema(game_map) for game_map in MAPS.values()]
    maps.extend(record_to_schema(record) for record in db.query(MapRecord).order_by(MapRecord.name).all())
    return maps


@router.get("", response_model=list[MapRead])
def list_maps(db: Session = Depends(get_db)) -> list[MapRead]:
    return all_maps(db)


@router.get("/{map_id}", response_model=MapRead)
def get_map(map_id: str, db: Session = Depends(get_db)) -> MapRead:
    if map_id in MAPS:
        return builtin_map_to_schema(MAPS[map_id])
    record = db.get(MapRecord, map_id)
    if not record:
        raise HTTPException(status_code=404, detail="Map not found")
    return record_to_schema(record)


@router.post("", response_model=MapRead, status_code=201)
def create_map(payload: MapCreate, db: Session = Depends(get_db)) -> MapRead:
    validation = validate_map_payload(payload)
    if not validation.isValid:
        raise HTTPException(status_code=400, detail=validation.errors)
    map_id = payload.id or f"map_{uuid4().hex[:10]}"
    if map_id in MAPS or db.get(MapRecord, map_id):
        raise HTTPException(status_code=400, detail="Map id already exists")
    record = MapRecord(id=map_id, name=payload.name)
    payload_to_record(record, payload)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record_to_schema(record)


@router.put("/{map_id}", response_model=MapRead)
def update_map(map_id: str, payload: MapCreate, db: Session = Depends(get_db)) -> MapRead:
    if map_id in MAPS:
        raise HTTPException(status_code=400, detail="Built-in maps cannot be edited")
    record = db.get(MapRecord, map_id)
    if not record:
        raise HTTPException(status_code=404, detail="Map not found")
    validation = validate_map_payload(payload)
    if not validation.isValid:
        raise HTTPException(status_code=400, detail=validation.errors)
    payload_to_record(record, payload)
    db.commit()
    db.refresh(record)
    return record_to_schema(record)


@router.delete("/{map_id}", status_code=204)
def delete_map(map_id: str, db: Session = Depends(get_db)) -> None:
    if map_id in MAPS:
        raise HTTPException(status_code=400, detail="Built-in maps cannot be deleted")
    record = db.get(MapRecord, map_id)
    if not record:
        raise HTTPException(status_code=404, detail="Map not found")
    db.delete(record)
    db.commit()


@router.post("/{map_id}/duplicate", response_model=MapRead, status_code=201)
def duplicate_map(map_id: str, db: Session = Depends(get_db)) -> MapRead:
    source = get_map(map_id, db)
    payload = MapCreate(**source.model_dump(exclude={"id", "createdAt", "updatedAt"}))
    payload.name = f"{source.name} Copy"
    payload.id = f"map_{uuid4().hex[:10]}"
    return create_map(payload, db)


@router.post("/{map_id}/validate", response_model=MapValidationResult)
def validate_map(map_id: str, db: Session = Depends(get_db)) -> MapValidationResult:
    source = get_map(map_id, db)
    return validate_map_payload(MapCreate(**source.model_dump(exclude={"createdAt", "updatedAt"})))


@router.post("/preview-random-generation")
def preview_random_generation(payload: MapCreate) -> dict:
    validation = validate_map_payload(payload)
    if not validation.isValid:
        raise HTTPException(status_code=400, detail=validation.errors)
    return {"fixedEntities": [entity.model_dump() for entity in payload.fixedEntities], "randomPreview": []}
