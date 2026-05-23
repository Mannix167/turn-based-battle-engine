from app.game.models import BattleEntity, GameState


def defeat_owned_summons(state: GameState, owner: BattleEntity) -> None:
    for summon in list(state.entities.values()):
        if summon.ownerId != owner.id or not summon.isAlive:
            continue
        summon.isAlive = False
        summon.currentHp = 0
        summon.statusEffects.clear()
        state.log.append(f"{summon.name} vanished because {owner.name} was defeated")
        defeat_owned_summons(state, summon)
