from pydantic import BaseModel, Field

from app.schemas.common import Position


class MapBase(BaseModel):
    name: str = Field(min_length=1)
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    validCells: list[Position] = []


class MapCreate(MapBase):
    id: str | None = None


class MapRead(MapBase):
    id: str
