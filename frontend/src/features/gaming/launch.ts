import { buildGamezopLaunchUrl } from './providers/gamezop'
import { buildHtml5GamesHqLaunchUrl } from './providers/html5gameshq'
import { buildSprittedLaunchUrl } from './providers/spritted'
import type { Game } from './types'

/**
 * Resolves a Game to the actual URL its iframe should load — the ONE
 * place that knows "which provider adapter to call," so GamePlayer.tsx
 * never imports a provider file directly. Adding a second provider later
 * means adding a `providers/<name>.ts` file and one case here, not
 * touching any presentation component.
 *
 * `gamezop` stays a real case even while unused by the active catalog
 * (see providers/gamezop.ts and gameCatalog.ts) — Gamezop returns as a
 * live provider once our publisher application is approved, without
 * this switch (or anything upstream of it) needing to change shape.
 *
 * The `never` check makes an unhandled provider a compile error rather
 * than a silent runtime bug the moment `GameProvider` grows a new value.
 */
export function resolveGameLaunchUrl(game: Game): string {
  switch (game.provider) {
    case 'gamezop':
      return buildGamezopLaunchUrl(game.providerGameId)
    case 'html5gameshq':
      return buildHtml5GamesHqLaunchUrl(game.providerGameId)
    case 'spritted':
      return buildSprittedLaunchUrl(game.providerGameId)
    default: {
      const unhandled: never = game.provider
      throw new Error(`Unknown game provider: ${unhandled}`)
    }
  }
}
