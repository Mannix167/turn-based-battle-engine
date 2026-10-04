import { AudioManager } from '../audio/AudioManager'

let context: AudioContext | null = null
const voices = new Set<AudioScheduledSourceNode>()

export function unlockBombAudio() {
  try {
    context ??= new AudioContext()
    void context.resume().catch(() => {})
  } catch { /* Audio availability never affects playback. */ }
}

export function stopBombAudio() {
  voices.forEach((node) => { try { node.stop() } catch { /* Already ended. */ } })
  voices.clear()
}

/** Small synthesized effects: no downloads or missing audio assets. */
export function playBombSound(kind: 'cast' | 'launch' | 'impact' | 'counter') {
  if (!context || context.state !== 'running' || AudioManager.getMuted()) return
  const ctx = context
  const start = ctx.currentTime
  const volume = AudioManager.getVolume() * 0.55
  const track = (source: AudioScheduledSourceNode) => {
    voices.add(source)
    source.onended = () => { voices.delete(source); source.disconnect() }
  }
  const tone = (from: number, to: number, duration: number, level: number, type: OscillatorType) => {
    const source = ctx.createOscillator()
    const gain = ctx.createGain()
    source.type = type
    source.frequency.setValueAtTime(from, start)
    source.frequency.exponentialRampToValueAtTime(to, start + duration)
    gain.gain.setValueAtTime(0.001, start)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * level), start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
    source.connect(gain).connect(ctx.destination)
    track(source)
    source.start(start)
    source.stop(start + duration)
    source.addEventListener('ended', () => gain.disconnect())
  }
  if (kind === 'cast') { tone(180, 420, 0.22, 0.2, 'sine'); return }
  if (kind === 'counter') { tone(260, 65, 0.15, 0.35, 'triangle'); return }
  if (kind === 'launch') tone(500, 120, 0.24, 0.15, 'triangle')
  if (kind === 'impact') tone(115, 28, 0.48, 0.9, 'sine')
  const duration = kind === 'impact' ? 0.68 : 0.25
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(kind === 'impact' ? 2800 : 1400, start)
  filter.frequency.exponentialRampToValueAtTime(100, start + duration)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(volume * (kind === 'impact' ? 0.85 : 0.18), start)
  gain.gain.exponentialRampToValueAtTime(0.001, start + duration)
  noise.connect(filter).connect(gain).connect(ctx.destination)
  track(noise)
  noise.start(start)
  noise.stop(start + duration)
  noise.addEventListener('ended', () => { gain.disconnect(); filter.disconnect() })
}
