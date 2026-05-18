from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class CharacterRecord(Base):
    __tablename__ = "characters"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    max_hp: Mapped[int] = mapped_column(Integer, default=100)
    base_attack: Mapped[int] = mapped_column(Integer, default=20)
    base_defense: Mapped[int] = mapped_column(Integer, default=5)
    attack_range: Mapped[int] = mapped_column(Integer, default=1)
    temp_ap_per_turn: Mapped[int] = mapped_column(Integer, default=2)
    speed: Mapped[int] = mapped_column(Integer, default=10)
    crit_rate: Mapped[int] = mapped_column(Integer, default=10)
    luck: Mapped[int] = mapped_column(Integer, default=50)
    portrait_image_url: Mapped[str] = mapped_column(String, nullable=True)
    token_image_url: Mapped[str] = mapped_column(String, nullable=True)
    default_skill_template_ids: Mapped[str] = mapped_column(Text, default="[]")


class MapRecord(Base):
    __tablename__ = "maps"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    width: Mapped[int] = mapped_column(Integer, default=8)
    height: Mapped[int] = mapped_column(Integer, default=8)
    cells_json: Mapped[str] = mapped_column(Text, default="[]")
    spawn_zones_json: Mapped[str] = mapped_column(Text, default="[]")
    fixed_entities_json: Mapped[str] = mapped_column(Text, default="[]")
    random_rules_json: Mapped[str] = mapped_column(Text, default="[]")
    background_image_url: Mapped[str] = mapped_column(String, nullable=True)
    created_at: Mapped[str] = mapped_column(String, default="")
    updated_at: Mapped[str] = mapped_column(String, default="")


class SkillRecord(Base):
    __tablename__ = "skills"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    icon_url: Mapped[str] = mapped_column(String, nullable=True)
    skill_kind: Mapped[str] = mapped_column(String, default="configurable")
    enabled: Mapped[int] = mapped_column(Integer, default=1)
    usable_as_json: Mapped[str] = mapped_column(Text, default='["common","reward"]')
    category: Mapped[str] = mapped_column(String, default="common")
    cost: Mapped[int] = mapped_column(Integer, default=1)
    range: Mapped[int] = mapped_column(Integer, default=1)
    target_type: Mapped[str] = mapped_column(String, default="single")
    area_type: Mapped[str] = mapped_column(String, default="single")
    can_target_self: Mapped[int] = mapped_column(Integer, default=0)
    can_target_ally: Mapped[int] = mapped_column(Integer, default=0)
    can_target_enemy: Mapped[int] = mapped_column(Integer, default=1)
    can_target_empty_cell: Mapped[int] = mapped_column(Integer, default=0)
    effects_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[str] = mapped_column(String, default="")
    updated_at: Mapped[str] = mapped_column(String, default="")
