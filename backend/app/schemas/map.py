from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.common import Position


class MapCell(BaseModel):
    x: int
    y: int
    enabled: bool = True
    terrainType: Literal["normal"] = "normal"
    tileImageUrl: str | None = None


class SpawnZone(BaseModel):
    id: str
    name: str
    cells: list[Position]
    type: Literal["player", "neutral", "custom"] = "player"


class MapFixedEntity(BaseModel):
    id: str
    type: Literal["monster", "treasure"]
    templateId: str | None = None
    x: int
    y: int


class MapRandomRule(BaseModel):
    id: str
    type: Literal["monster", "treasure"]
    count: int = Field(ge=0)
    allowedCells: list[Position] = []
    excludedCells: list[Position] = []
    templatePool: list[str] = []


class MapBase(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    cells: list[MapCell] = []
    validCells: list[Position] = []
    spawnZones: list[SpawnZone] = []
    fixedEntities: list[MapFixedEntity] = []
    randomRules: list[MapRandomRule] = []
    backgroundImageUrl: str | None = None


class MapCreate(MapBase):
    id: str | None = None


class MapRead(MapBase):
    id: str
    createdAt: str = ""
    updatedAt: str = ""


class MapValidationResult(BaseModel):
    isValid: bool
    errors: list[str] = []
    warnings: list[str] = []
