from pydantic import BaseModel, Field


class Position(BaseModel):
    x: int
    y: int


class ApiMessage(BaseModel):
    message: str


class ErrorDetail(BaseModel):
    code: str
    message: str


class IdResponse(BaseModel):
    id: str = Field(min_length=1)
