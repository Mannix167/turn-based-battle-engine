import GameImage from './GameImage'
import { statusVisual } from '../data/assets'

export default function StatusIcon({ type }: { type: string }) {
  const visual = statusVisual(type)
  return <GameImage src={visual.iconUrl} fallbackKind="status" alt={visual.label} />
}
