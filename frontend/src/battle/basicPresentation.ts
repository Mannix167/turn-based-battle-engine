import type { GameStateRead } from '../types/game'
import type { PresentationCue, PresentationPlan } from './playback'

/** Keep event history so a reward response cannot replay the preceding action. */
export function resolvePresentation(before: GameStateRead, after: GameStateRead): PresentationPlan | null {
  const seen = new Set(before.recentEvents.map((event) => event.id))
  const bomb = after.recentEvents.find((event) => !seen.has(event.id) && event.playback?.visualKey === 'bomb')?.playback
  return bomb ?? buildBasicPresentation(before, after)
}

/** Animate already settled facts. No targeting, damage, AP or victory rules live here. */
export function buildBasicPresentation(before: GameStateRead, after: GameStateRead): PresentationPlan | null {
  const previous = new Map(before.entities.map((entity) => [entity.id, entity]))
  const seenEvents = new Set(before.recentEvents.map((event) => event.id))
  const events = after.recentEvents.filter((event) => !seenEvents.has(event.id))
  const cast = events.find((event) => event.type === 'skill_cast')
  const attack = events.find((event) => event.type === 'basic_attack' || event.type === 'terrain_damaged')
  const moved = after.entities.filter((entity) => {
    const prev = previous.get(entity.id)
    return prev && (entity.x !== prev.x || entity.y !== prev.y)
  })
  const dug = after.treasures.find((treasure) => treasure.isDug && before.treasures.some((prev) => prev.id === treasure.id && !prev.isDug))
  const actor = previous.get(cast?.actorId ?? attack?.actorId ?? before.currentEntityId ?? '')
  if (!actor) return null
  const cues: PresentationCue[] = []
  const add = (kind: PresentationCue['kind'], atMs: number, fields: Partial<PresentationCue> = {}) => cues.push({ kind, atMs, isCrit: false, ...fields })
  const hitAt = cast ? 240 : attack ? 170 : 0
  if (cast) add('cast', 0, { entityId: actor.id })
  if (attack) add('attack', 0, { entityId: actor.id, targetPosition: attack.targetPosition })
  if (cast || attack) add('impact', hitAt)
  moved.forEach((entity) => add('move', 0, { entityId: entity.id, sourcePosition: previous.get(entity.id)!, targetPosition: entity }))
  if (dug) {
    const newLogs = after.log.slice(before.log.length)
    const failed = newLogs.some((line) => /failed to dig/.test(line))
    add(failed ? 'dig-fail' : 'dig-success', 100, { entityId: dug.id, targetPosition: dug })
  }
  let lastDamageAt = hitAt
  const damagedIds = new Set<string>()
  // Do not replay stale DamageEvents returned by reward/other non-combat actions.
  if (after.entities.some((entity) => entity.currentHp < (previous.get(entity.id)?.currentHp ?? entity.currentHp))) {
    const hp = new Map(before.entities.map((entity) => [entity.id, entity.currentHp]))
    after.recentDamageEvents.forEach((damage) => {
      const target = after.entities.find((entity) => entity.id === damage.targetEntityId)
      if (!target || target.currentHp >= (previous.get(target.id)?.currentHp ?? target.currentHp)) return
      const counter = (cast || attack) && damage.sourceEntityId !== actor.id && !damage.linkedFromEntityId
      const atMs = counter ? hitAt + 400 : hitAt
      if (counter) add('counter', atMs - 140, { entityId: damage.sourceEntityId, targetPosition: target })
      const hpAfter = Math.max(target.currentHp, (hp.get(target.id) ?? target.currentHp) - damage.amount)
      hp.set(target.id, hpAfter)
      add('damage', atMs, { entityId: target.id, sourceEntityId: damage.sourceEntityId, amount: damage.amount, hpAfter, isCrit: damage.isCrit })
      damagedIds.add(target.id)
      lastDamageAt = Math.max(lastDamageAt, atMs)
    })
  }
  after.entities.forEach((entity) => {
    const prev = previous.get(entity.id)
    if (!prev) { add('appear', hitAt, { entityId: entity.id }); return }
    if (entity.currentHp < prev.currentHp && !damagedIds.has(entity.id)) {
      add('damage', hitAt, { entityId: entity.id, sourceEntityId: actor.id, amount: prev.currentHp - entity.currentHp, hpAfter: entity.currentHp })
    }
    if (entity.currentHp > prev.currentHp) add('heal', hitAt, { entityId: entity.id, amount: entity.currentHp - prev.currentHp, hpAfter: entity.currentHp })
    if (entity.statusEffects.some((status) => !prev.statusEffects.some((old) => old.id === status.id))) add('status', hitAt + 80, { entityId: entity.id })
    if (prev.isAlive && !entity.isAlive) add('death', lastDamageAt + 280, { entityId: entity.id })
  })
  const newAlliances = (after.alliances ?? []).filter((link) => !(before.alliances ?? []).some((old) => old.sourceEntityId === link.sourceEntityId && old.targetEntityId === link.targetEntityId))
  newAlliances.forEach((link) => { add('status', hitAt + 80, { entityId: link.sourceEntityId }); add('status', hitAt + 80, { entityId: link.targetEntityId }) })
  if (!cues.length) return null
  add('sync', hitAt)
  const durationMs = Math.max(moved.length ? 360 : 650, ...cues.map((cue) => cue.atMs + (cue.kind === 'death' ? 650 : 600)))
  return {
    id: `basic:${after.gameId}:${after.log.length}:${events.map((event) => event.id).join(':')}`,
    visualKey: 'basic', actorId: actor.id, sourcePosition: actor,
    targetPosition: cast?.targetPosition ?? attack?.targetPosition ?? dug ?? actor,
    label: cast ? '技能' : attack ? '攻击' : moved.length ? '移动' : dug ? '挖宝' : '状态', durationMs, cues,
  }
}
