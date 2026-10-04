import { useState, type ImgHTMLAttributes } from 'react'
import { DEFAULT_ASSETS, type AssetKind } from '../data/assets'

interface Props extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src?: string | null
  fallbackKind?: AssetKind
}

/** Empty, unavailable and corrupt images all fall back without a request loop. */
export default function GameImage({ src, fallbackKind = 'character', alt = '', onError, ...props }: Props) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const [failedFallback, setFailedFallback] = useState<string | null>(null)
  const fallback = DEFAULT_ASSETS[fallbackKind]
  const primary = src?.trim() || null
  const resolved = primary && primary !== failedSrc ? primary : fallback
  if (resolved === failedFallback) {
    return <span className={`asset-text-fallback ${props.className ?? ''}`} role="img" aria-label={alt} style={props.style}>{alt.charAt(0) || '?'}</span>
  }
  return <img {...props} src={resolved} alt={alt} data-asset-fallback={resolved === fallback ? fallbackKind : undefined}
    onError={(event) => {
      if (resolved === fallback) setFailedFallback(fallback)
      else setFailedSrc(resolved)
      onError?.(event)
    }} />
}
