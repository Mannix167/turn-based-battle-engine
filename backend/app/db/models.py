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
    rarity: Mapped[str] = mapped_column(String, default="common")
    skill_point_capacity: Mapped[int] = mapped_column(Integer, default=3)
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


class MonsterTemplateRecord(Base):
    __tablename__ = "monster_templates"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    max_hp: Mapped[int] = mapped_column(Integer, default=30)
    base_attack: Mapped[int] = mapped_column(Integer, default=8)
    base_defense: Mapped[int] = mapped_column(Integer, default=1)
    attack_range: Mapped[int] = mapped_column(Integer, default=1)
    speed: Mapped[int] = mapped_column(Integer, default=0)
    crit_rate: Mapped[int] = mapped_column(Integer, default=0)
    luck: Mapped[int] = mapped_column(Integer, default=0)
    temp_ap_per_turn: Mapped[int] = mapped_column(Integer, default=1)
    rarity: Mapped[str] = mapped_column(String, default="common")
    token_image_url: Mapped[str] = mapped_column(String, nullable=True)
    portrait_image_url: Mapped[str] = mapped_column(String, nullable=True)
    enabled: Mapped[int] = mapped_column(Integer, default=1)
    can_spawn_as_monster: Mapped[int] = mapped_column(Integer, default=1)
    can_be_summoned: Mapped[int] = mapped_column(Integer, default=0)
    summon_skill_template_ids: Mapped[str] = mapped_column(Text, default="[]")
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
    rarity: Mapped[str] = mapped_column(String, default="common")
    skill_point_cost: Mapped[int] = mapped_column(Integer, default=1)
    categories_json: Mapped[str] = mapped_column(Text, default='["damage"]')
    editable: Mapped[int] = mapped_column(Integer, default=1)
    is_system_skill: Mapped[int] = mapped_column(Integer, default=0)
    version: Mapped[int] = mapped_column(Integer, default=1)
    category: Mapped[str] = mapped_column(String, default="common")
    cost: Mapped[int] = mapped_column(Integer, default=1)
    range: Mapped[int] = mapped_column(Integer, default=1)
    target_type: Mapped[str] = mapped_column(String, default="single")
    area_type: Mapped[str] = mapped_column(String, default="single")
    area_size: Mapped[int] = mapped_column(Integer, default=1)
    affect_self_damage: Mapped[int] = mapped_column(Integer, default=0)
    can_target_self: Mapped[int] = mapped_column(Integer, default=0)
    can_target_ally: Mapped[int] = mapped_column(Integer, default=0)
    can_target_enemy: Mapped[int] = mapped_column(Integer, default=1)
    can_target_empty_cell: Mapped[int] = mapped_column(Integer, default=0)
    can_target_monster: Mapped[int] = mapped_column(Integer, default=1)
    can_target_summon: Mapped[int] = mapped_column(Integer, default=1)
    can_target_treasure: Mapped[int] = mapped_column(Integer, default=0)
    can_target_terrain: Mapped[int] = mapped_column(Integer, default=0)
    visual_json: Mapped[str] = mapped_column(Text, default="{}")
    effects_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[str] = mapped_column(String, default="")
    updated_at: Mapped[str] = mapped_column(String, default="")
