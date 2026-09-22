/**
 * Which section of the selector a game belongs in. Deliberately just two
 * values for this POC's three games — see gameCatalog.ts's own doc
 * comment for why this isn't a bigger category enum yet.
 */
export type GameCategory = 'together' | 'solo'

/**
 * Which external service actually hosts/runs a game. `gamezop` stays
 * defined even while temporarily unused (see providers/gamezop.ts) —
 * Gamezop returns as an active provider once our publisher application
 * is approved, at which point this is a catalog change, not an
 * architecture change. `html5gameshq` and `spritted` are the two
 * providers actually powering the current deployable catalog.
 */
export type GameProvider = 'gamezop' | 'html5gameshq' | 'spritted'

/**
 * Our Space's own description of one playable game — independent of
 * exactly how the provider launches it. `id` is OUR stable identifier
 * (used for React keys and future history/analytics); `providerGameId`
 * is the provider's own id/slug, only ever read by that provider's own
 * adapter (see providers/*.ts, launch.ts) — presentation components
 * never construct a launch URL themselves.
 */
export interface Game {
  id: string
  provider: GameProvider
  providerGameId: string
  name: string
  description: string
  category: GameCategory
  /** A legitimate artwork URL from the provider's own public catalog, if
   * one exists — never a placeholder or a locally-hosted copy of a
   * third-party asset. Optional: GameCard renders fine without one
   * (see gameCatalog.ts for the games where no such asset was found). */
  artworkUrl?: string
  /** Some providers' own published embed snippets require a visible
   * backlink as a condition of free embedding (e.g. HTML5GamesHQ's own
   * embed code includes "Please dont remove the link below" next to a
   * "More Games at..." link) — GamePlayer renders this small, unobtrusive
   * link when present. Optional: most providers don't require one. */
  attribution?: { label: string; url: string }
}
