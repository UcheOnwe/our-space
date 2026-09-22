import type { CSSProperties } from 'react'

interface AmbientImageProps {
  src: string
  className?: string
  style?: CSSProperties
}

/**
 * The static-art equivalent of AmbientVideo — used by rooms whose
 * environment is high-quality still art rather than generated video (see
 * AfterHoursRoom.tsx's own doc comment for why). Deliberately just a
 * plain `<img>`: there's no autoplay/poster-handoff concern a still image
 * needs solved for it the way AmbientVideo's iOS Safari autoplay dance
 * exists for video. `aria-hidden` for the same reason AmbientVideo is —
 * it's the room's own decorative backdrop, not content to announce.
 */
export function AmbientImage({ src, className, style }: AmbientImageProps) {
  return <img className={className} style={style} src={src} alt="" aria-hidden="true" draggable={false} />
}
