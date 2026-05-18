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
