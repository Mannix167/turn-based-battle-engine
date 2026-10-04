import test from 'node:test'
import assert from 'node:assert/strict'
import { PlaybackQueue } from '../src/battle/playback.ts'

const plan = (id) => ({
  id, visualKey: 'bomb', actorId: 'a', sourcePosition: { x: 0, y: 0 }, targetPosition: { x: 1, y: 0 },
  durationMs: 1000, cues: [{ atMs: 0, kind: 'cast' }, { atMs: 500, kind: 'damage' }],
})
const callbacks = (log, id) => ({
  start: () => log.push(id + ':start'),
  cue: (cue) => log.push(id + ':' + cue.kind),
  complete: () => log.push(id + ':end'),
})

test('damage waits for its checkpoint and events are emitted once', () => {
  const q = new PlaybackQueue(), log = []
  q.enqueue(plan('a'), callbacks(log, 'a'))
  q.tick(2000); q.tick(2499)
  assert.deepEqual(log, ['a:start', 'a:cast'])
  q.tick(2500); q.tick(2600); q.tick(3000); q.tick(4000)
  assert.deepEqual(log, ['a:start', 'a:cast', 'a:damage', 'a:end'])
  assert.equal(q.busy, false)
})

test('FIFO starts the second action only after the first completes; deduplicates responses', () => {
  const q = new PlaybackQueue(), log = []
  assert.equal(q.enqueue(plan('a'), callbacks(log, 'a')), true)
  assert.equal(q.enqueue(plan('a'), callbacks(log, 'a')), false)
  q.enqueue(plan('b'), callbacks(log, 'b'))
  q.tick(0); q.tick(1000); q.tick(1001); q.tick(2001)
  assert.deepEqual(log, ['a:start', 'a:cast', 'a:damage', 'a:end', 'b:start', 'b:cast', 'b:damage', 'b:end'])
})

test('skip commits queued results once without delayed sounds or damage cues', () => {
  const q = new PlaybackQueue(), log = []
  q.enqueue(plan('a'), callbacks(log, 'a'))
  q.enqueue(plan('b'), callbacks(log, 'b'))
  q.tick(0); q.finishAll(); q.finishAll(); q.tick(5000)
  assert.deepEqual(log, ['a:start', 'a:cast', 'a:end', 'b:end'])
})

test('unmount discards callbacks, and a delayed frame cannot leave input locked', () => {
  const q = new PlaybackQueue(), log = []
  q.enqueue(plan('a'), callbacks(log, 'a'))
  q.tick(0); q.dispose(); q.tick(1000)
  assert.deepEqual(log, ['a:start', 'a:cast'])
  q.enqueue(plan('b'), callbacks(log, 'b'))
  q.tick(2000); q.tick(20000)
  assert.equal(q.busy, false)
  assert.deepEqual(log.slice(2), ['b:start', 'b:cast', 'b:damage', 'b:end'])
})