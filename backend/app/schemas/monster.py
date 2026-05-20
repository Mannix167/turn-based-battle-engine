from pydantic import BaseModel, Field


class MonsterTemplateBase(BaseModel):
    name: str = Field(min_length=1)
    description: str = ""
    maxHp: int = Field(default=30, gt=0)
    baseAttack: int = Field(default=8, ge=0)
    baseDefense: int = Field(default=1, ge=0)
    attackRange: int = Field(default=1, ge=1)
    speed: int = Field(default=0, ge=0)
    critRate: int = Field(default=0, ge=0, le=100)
    luck: int = Field(default=0, ge=0, le=100)
    tokenImageUrl: str | None = None
    portraitImageUrl: str | None = None
    enabled: bool = True


class MonsterTemplateCreate(MonsterTemplateBase):
    id: str | None = None


class MonsterTemplateUpdate(MonsterTemplateBase):
    pass


class MonsterTemplateRead(MonsterTemplateBase):
    id: str
    createdAt: str = ""
    updatedAt: str = ""
