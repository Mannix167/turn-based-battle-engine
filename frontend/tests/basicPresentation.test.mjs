import test from 'node:test'
import assert from 'node:assert/strict'
import { buildBasicPresentation, resolvePresentation } from '../src/battle/basicPresentation.ts'

const entity = (id, fields = {}) => ({ id, type: 'character', name: id, x: 1, y: 1, currentHp: 100, maxHp: 100, isAlive: true, statusEffects: [], skillInstances: [], ...fields })
const state = (entities, fields = {}) => ({ gameId: 'test', currentEntityId: 'a', entities, treasures: [], alliances: [], log: ['start'], recentEvents: [], recentDamageEvents: [], ...fields })
const attackEvent = { id: 'attack-1', type: 'basic_attack', actorId: 'a', sourcePosition: { x: 1, y: 1 }, targetPosition: { x: 2, y: 1 } }

test('move keeps its origin and destination for interpolation without changing the settled result', () => {
  const before = state([entity('a')]), after = state([entity('a', { x: 2 })], { log: ['start', 'moved'] })
  const original = structuredClone(after)
  const plan = buildBasicPresentation(before, after)
  const cue = plan.cues.find(cue => cue.kind === 'move')
  assert.equal(cue.sourcePosition.x, 1)
  assert.equal(cue.targetPosition.x, 2)
  assert.deepEqual(after, original)
})

test('a lethal attack preserves damage feedback before death and leaves time for the fade', () => {
  const before = state([entity('a'), entity('b', { x: 2, currentHp: 8 })])
  const after = state([entity('a'), entity('b', { x: 2, currentHp: 0, isAlive: false })], {
    log: ['start', 'hit', 'died'], recentEvents: [attackEvent], recentDamageEvents: [{ sourceEntityId: 'a', targetEntityId: 'b', amount: 8, isCrit: false }],
  })
  const plan = buildBasicPresentation(before, after)
  const damage = plan.cues.find(cue => cue.kind === 'damage'), death = plan.cues.find(cue => cue.kind === 'death')
  assert.equal(damage.amount, 8)
  assert.equal(damage.hpAfter, 0)
  assert.ok(death.atMs > damage.atMs)
  assert.ok(plan.durationMs >= death.atMs + 620)
})

test('counter damage follows the first hit and uses backend amounts', () => {
  const before = state([entity('a'), entity('b', { type: 'monster', x: 2 })])
  const after = state([entity('a', { currentHp: 87 }), entity('b', { type: 'monster', x: 2, currentHp: 81 })], {
    recentEvents: [attackEvent], recentDamageEvents: [{ sourceEntityId: 'a', targetEntityId: 'b', amount: 19 }, { sourceEntityId: 'b', targetEntityId: 'a', amount: 13 }],
  })
  const plan = buildBasicPresentation(before, after)
  const hits = plan.cues.filter(cue => cue.kind === 'damage')
  assert.deepEqual(hits.map(cue => [cue.amount, cue.hpAfter]), [[19, 81], [13, 87]])
  assert.ok(hits[1].atMs > hits[0].atMs)
  assert.ok(plan.cues.find(cue => cue.kind === 'counter').atMs < hits[1].atMs)
})

test('reward responses cannot replay stale attack or damage events', () => {
  const before = state([entity('a'), entity('b', { currentHp: 85 })], { recentEvents: [attackEvent], recentDamageEvents: [{ sourceEntityId: 'a', targetEntityId: 'b', amount: 15 }] })
  const after = { ...before, log: [...before.log, 'reward'], entities: [entity('a', { skillInstances: [{ templateId: 'medkit' }] }), before.entities[1]] }
  assert.equal(buildBasicPresentation(before, after), null)
})

test('bomb reward responses commit their state without replaying the completed timeline', () => {
  const bomb = { ...attackEvent, type: 'skill_cast', playback: { id: 'bomb:1', visualKey: 'bomb', actorId: 'a', durationMs: 1200, cues: [] } }
  const before = state([entity('a'), entity('b', { currentHp: 8 })])
  const defeated = state([entity('a'), entity('b', { currentHp: 0, isAlive: false })], { recentEvents: [bomb], log: ['start', 'bomb', 'died'] })
  assert.equal(resolvePresentation(before, defeated), bomb.playback)
  const rewarded = { ...defeated, log: [...defeated.log, 'reward'], entities: [entity('a', { skillInstances: [{ templateId: 'medkit' }] }), defeated.entities[1]] }
  assert.equal(resolvePresentation(defeated, rewarded), null)
})

test('heal, new status, summon and dig feedback follow authoritative state changes', () => {
  const before = state([entity('a', { currentHp: 60 })], { treasures: [{ id: 't', x: 2, y: 1, isDug: false }] })
  const after = state([entity('a', { currentHp: 85, statusEffects: [{ id: 'buff', type: 'burn' }] }), entity('s', { type: 'summon' })], { log: ['start', 'found a skill'], treasures: [{ id: 't', x: 2, y: 1, isDug: true }] })
  const plan = buildBasicPresentation(before, after)
  assert.equal(plan.cues.find(cue => cue.kind === 'heal').amount, 25)
  for (const kind of ['status', 'appear', 'dig-success']) assert.ok(plan.cues.some(cue => cue.kind === kind))
  assert.deepEqual(before.entities[0].statusEffects, [])
})

test('failed digging with no damage still has failure feedback', () => {
  const before = state([entity('a')], { treasures: [{ id: 't', x: 2, y: 1, isDug: false }] })
  const after = state([entity('a')], { log: ['start', 'a failed to dig t'], treasures: [{ id: 't', x: 2, y: 1, isDug: true }] })
  assert.ok(buildBasicPresentation(before, after).cues.some(cue => cue.kind === 'dig-fail'))
})
