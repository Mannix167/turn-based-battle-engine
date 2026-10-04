import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import type { GameStateRead } from '../types/game'
import { PlaybackQueue, type ActivePlayback, type TokenVisualEffect } from './playback'
import { playBombSound, stopBombAudio } from './bombAudio'
import { resolvePresentation } from './basicPresentation'
import { AudioManager } from '../audio/AudioManager'

export function useBattlePlayback(
  setState: Dispatch<SetStateAction<GameStateRead | null>>,
  setEffects: Dispatch<SetStateAction<Record<string, TokenVisualEffect>>>,
) {
  const queue = useRef(new PlaybackQueue())
  const raf = useRef(0)
  const playingRef = useRef(false)
  const mounted = useRef(true)
  const [active, setActive] = useState<ActivePlayback | null>(null)
  const [phase, setPhase] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)

  const finish = () => {
    queue.current.finishAll()
    stopBombAudio()
    playingRef.current = false
    setIsPlaying(false)
    setActive(null)
    setPhase('')
    setEffects({})
    cancelAnimationFrame(raf.current)
  }

  useEffect(() => {
    mounted.current = true
    const onVisibility = () => { if (document.hidden && playingRef.current) finish() }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      mounted.current = false
      queue.current.dispose()
      playingRef.current = false
      cancelAnimationFrame(raf.current)
      stopBombAudio()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  const play = (before: GameStateRead, after: GameStateRead, onComplete?: () => void): boolean => {
    const plan = resolvePresentation(before, after)
    if (!plan) return false
    const isBomb = plan.visualKey === 'bomb'
    const finalState = after
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setState(finalState)
      setEffects({})
      onComplete?.()
      return true
    }
    const accepted = queue.current.enqueue(plan, {
      start: (playback) => {
        if (!mounted.current) return
        setActive(playback)
        // Resources are already spent, but HP, deaths, logs and rewards wait for cues.
        setState({
          ...before, recentEvents: [], recentDamageEvents: [],
          entities: before.entities.map((entity) => {
            const next = after.entities.find((item) => item.id === entity.id)
            return entity.id === plan.actorId && next
              ? { ...entity, temporaryAP: next.temporaryAP, permanentAP: next.permanentAP, skillInstances: next.skillInstances }
              : entity
          }),
        })
        setEffects({})
      },
      cue: (cue, index) => {
        if (!mounted.current) return
        const id = plan.id + ':' + index
        if (cue.kind === 'cast') {
          setPhase(isBomb ? '准备投掷' : '释放技能')
          setEffects({ [plan.actorId]: { type: 'cast', id } })
          if (isBomb) playBombSound('cast')
        } else if (cue.kind === 'launch') {
          setPhase('炸弹飞行中')
          setEffects({})
          playBombSound('launch')
        } else if (cue.kind === 'impact') {
          setPhase('命中')
          if (isBomb) playBombSound('impact')
          else setState((state) => state && ({ ...state, recentEvents: after.recentEvents.filter((event) => !before.recentEvents.some((prev) => prev.id === event.id)) }))
        } else if (cue.kind === 'counter') {
          setPhase('反击')
          if (isBomb) playBombSound('counter')
          else {
            AudioManager.play('counter_attack')
            if (cue.entityId) setEffects((effects) => ({ ...effects, [cue.entityId!]: { type: 'attack', targetPosition: cue.targetPosition ?? undefined, id } }))
          }
        } else if (cue.kind === 'sync') {
          setState((state) => state && ({ ...state,
            map: after.map, treasures: after.treasures, alliances: after.alliances,
            entities: state.entities.map((entity) => {
              const next = after.entities.find((item) => item.id === entity.id)
              return next ? { ...next, x: entity.x, y: entity.y, currentHp: entity.currentHp, isAlive: entity.isAlive } : entity
            }),
          }))
        } else if (cue.entityId && cue.kind === 'move') {
          setPhase('移动')
          setState((state) => state && ({ ...state, entities: state.entities.map((entity) => entity.id === cue.entityId && cue.targetPosition ? { ...entity, x: cue.targetPosition.x, y: cue.targetPosition.y } : entity) }))
          setEffects((effects) => ({ ...effects, [cue.entityId!]: { type: 'move', fromPosition: cue.sourcePosition ?? undefined, targetPosition: cue.targetPosition ?? undefined, id } }))
          AudioManager.play('move_step')
        } else if (cue.entityId && cue.kind === 'attack') {
          setPhase('攻击')
          setEffects((effects) => ({ ...effects, [cue.entityId!]: { type: 'attack', targetPosition: cue.targetPosition ?? undefined, id } }))
        } else if (cue.entityId && cue.kind === 'heal') {
          setPhase('治疗')
          setState((state) => state && ({ ...state, entities: state.entities.map((entity) => entity.id === cue.entityId ? { ...entity, currentHp: cue.hpAfter ?? entity.currentHp } : entity) }))
          setEffects((effects) => ({ ...effects, [cue.entityId!]: { type: 'heal', amount: cue.amount ?? 0, id } }))
          AudioManager.play('heal')
        } else if (cue.entityId && cue.kind === 'status') {
          setPhase('状态变化')
          // Preserve a simultaneous heal/hit; new status icons still appear at sync.
          setEffects((effects) => effects[cue.entityId!]?.type === 'hit' || effects[cue.entityId!]?.type === 'heal' || effects[cue.entityId!]?.type === 'critical' ? effects : { ...effects, [cue.entityId!]: { type: 'buff', id } })
          AudioManager.play('buff_apply')
        } else if (cue.entityId && cue.kind === 'appear') {
          setPhase('召唤')
          const entity = after.entities.find((item) => item.id === cue.entityId)
          if (entity) setState((state) => state && ({ ...state, entities: [...state.entities.filter((item) => item.id !== entity.id), entity] }))
          setEffects((effects) => ({ ...effects, [cue.entityId!]: { type: 'appear', id } }))
        } else if (cue.entityId && (cue.kind === 'dig-success' || cue.kind === 'dig-fail')) {
          setPhase(cue.kind === 'dig-success' ? '挖宝成功' : '挖宝失败')
          setEffects((effects) => ({ ...effects, [cue.entityId!]: { type: cue.kind as 'dig-success' | 'dig-fail', id } }))
          setEffects((effects) => effects[plan.actorId]?.type === 'hit' || effects[plan.actorId]?.type === 'critical' ? effects : { ...effects, [plan.actorId]: { type: cue.kind as 'dig-success' | 'dig-fail', id: id + ':actor' } })
          AudioManager.play(cue.kind === 'dig-success' ? 'dig_success' : 'dig_fail')
        } else if (cue.entityId && cue.kind === 'damage') {
          setPhase(isBomb || plan.cues.some((item) => item.kind === 'counter') ? cue.sourceEntityId === plan.actorId ? '命中' : '反击命中' : '受伤')
          setState((state) => state && ({
            ...state, entities: state.entities.map((entity) =>
              entity.id === cue.entityId ? { ...entity, currentHp: cue.hpAfter ?? entity.currentHp } : entity),
          }))
          setEffects((effects) => ({
            ...effects, [cue.entityId!]: { type: cue.isCrit ? 'critical' : 'hit', amount: cue.amount ?? 0, id },
          }))
        } else if (cue.entityId && cue.kind === 'death') {
          setPhase('击倒')
          setState((state) => state && ({
            ...state, entities: state.entities.map((entity) =>
              entity.id === cue.entityId ? { ...entity, isAlive: false, currentHp: 0 } : entity),
          }))
          setEffects((effects) => ({ ...effects, [cue.entityId!]: { type: 'die', id } }))
          if (!isBomb) AudioManager.play('death')
        }
      },
      complete: () => {
        if (!mounted.current) return
        setState(finalState)
        setEffects({})
        setActive(null)
        onComplete?.()
      },
    })
    if (!accepted) return false
    playingRef.current = true
    setIsPlaying(true)
    cancelAnimationFrame(raf.current)
    const tick = (now: number) => {
      queue.current.tick(now)
      if (queue.current.busy) raf.current = requestAnimationFrame(tick)
      else {
        playingRef.current = false
        setIsPlaying(false)
        setPhase('')
      }
    }
    raf.current = requestAnimationFrame(tick)
    return true
  }

  return { play, active, phase, isPlaying, playingRef, skip: finish }
}
