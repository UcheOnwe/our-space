import { buildGamezopArtworkUrl } from './providers/gamezop'
import { HTML5GAMESHQ_ATTRIBUTION } from './providers/html5gameshq'
import type { Game } from './types'

/**
 * The deployable catalog's fixed three games — a plain array, not a
 * fetched/paginated structure, because that's genuinely all the state
 * three curated games need. `GameSelector` groups these by `category`
 * (see types.ts) rather than hardcoding two separate lists, so adding a
 * 4th/5th/20th game (or a 3rd category) later is a new array entry, not
 * a GameSelector rewrite — see that component's own doc comment.
 *
 * PROVIDER STATE: Gamezop's own public embed explicitly labels itself
 * "provided for evaluation purposes... use in products, public settings,
 * or for commercial purposes is prohibited" (confirmed directly on the
 * live game page) — not something to deploy publicly while our
 * publisher application is pending. GAMEZOP_GAMES below documents the
 * original 3-game Gamezop POC and stays fully wired through
 * providers/gamezop.ts and launch.ts, but is intentionally NOT part of
 * GAME_CATALOG (the array the live app actually renders) until real
 * publisher credentials arrive — swapping Gamezop back in then is
 * restoring this array, not rebuilding the Gaming feature.
 *
 * The active catalog instead uses two providers whose own sites publish
 * a webmaster/embed program for third-party sites (HTML5GamesHQ,
 * Spritted) — each game's exact embed URL was verified directly against
 * that provider's own published snippet, and each embed was loaded live
 * from this app's own localhost origin to confirm it actually renders,
 * not assumed from a URL pattern.
 *
 * Real curated catalog data (20+ games, live from Gamezop's publisher
 * API) eventually replaces GAME_CATALOG's contents; GameSelector,
 * GameCard, and GamePlayer don't know or care where the array came from.
 */
export const GAME_CATALOG: Game[] = [
  {
    id: '8-ball-pool-multiplayer',
    provider: 'html5gameshq',
    providerGameId: '8-ball-pool-multiplayer',
    name: '8 Ball Pool Multiplayer',
    description:
      'Classic 8-ball pool with ranked matches and tournaments, as described by the provider — a public online multiplayer game, not a private match with your partner.',
    category: 'together',
    attribution: HTML5GAMESHQ_ATTRIBUTION,
  },
  {
    id: 'basketball-stars',
    provider: 'html5gameshq',
    providerGameId: 'basketball-stars',
    name: 'Basketball Stars',
    description: 'A quick 1-on-1 basketball showdown — local two-player on one device, or practice solo against the computer.',
    category: 'together',
    attribution: HTML5GAMESHQ_ATTRIBUTION,
  },
  {
    id: 'physics-drop',
    provider: 'spritted',
    providerGameId: 'physics-drop',
    name: 'Physics Drop',
    description: 'A relaxed physics puzzle — draw lines to guide the ball into the goal. Perfect for some solo time.',
    category: 'solo',
    // Spritted's own game-page share/thumbnail image for this exact
    // game (verified directly: https://spritted.com/en/game/physics-drop).
    artworkUrl: 'https://spritted.com/assets/games/fbshare/physicsdrop.jpg',
  },
]

/**
 * The original Gamezop POC catalog — kept here (not deleted) so the
 * provider adapter, launch resolver, and this exact data are ready to
 * restore the moment Gamezop publisher access arrives. Not part of
 * GAME_CATALOG; nothing in the live app currently renders these.
 */
export const GAMEZOP_GAMES: Game[] = [
  {
    id: 'ludo-with-friends',
    provider: 'gamezop',
    providerGameId: 'SkhljT2fdgb',
    name: 'Ludo With Friends',
    description: 'The classic Ludo board, with a real room-code invite so you can play a match together.',
    category: 'together',
    artworkUrl: buildGamezopArtworkUrl('SkhljT2fdgb'),
  },
  {
    id: 'zuno',
    provider: 'gamezop',
    providerGameId: 'ByQxJnp7qRB',
    name: 'ZUNO',
    description: 'A fast-paced Uno-style card game with online multiplayer matches.',
    category: 'together',
    artworkUrl: buildGamezopArtworkUrl('ByQxJnp7qRB'),
  },
  {
    id: 'fruity-fiesta',
    provider: 'gamezop',
    providerGameId: 'mKZZW9NXW',
    name: 'Fruity Fiesta',
    description: 'A relaxed match-and-merge game to enjoy solo — perfect for when your partner is offline.',
    category: 'solo',
    artworkUrl: buildGamezopArtworkUrl('mKZZW9NXW'),
  },
]
