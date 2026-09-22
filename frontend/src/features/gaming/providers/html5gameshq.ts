/**
 * HTML5GamesHQ-specific launch URL construction — copied directly from
 * the exact embed code shown on each game's own page (e.g.
 * https://html5gameshq.com/game/8-ball-pool-multiplayer's own "Embed"
 * section), not guessed from a pattern. `providerGameId` is the slug
 * HTML5GamesHQ itself uses in both its game-page and embed-page URLs
 * (e.g. "8-ball-pool-multiplayer", "basketball-stars").
 *
 * Their own published snippet is:
 *   <iframe style="height:100%;width:100%"
 *     src="https://html5gameshq.com/iframed/<slug>"
 *     frameborder="0" scrolling="no"></iframe>
 *   <!-- Please dont remove the link below. Contact us if you have questions. -->
 *   <a href="https://html5gameshq.com/?r=embed-ref">More Games at HTML5GamesHQ...</a>
 *
 * The backlink is a stated condition of their free embedding — see
 * HTML5GAMESHQ_ATTRIBUTION, which gameCatalog.ts attaches to every game
 * from this provider and GamePlayer.tsx renders.
 */
export function buildHtml5GamesHqLaunchUrl(providerGameId: string): string {
  return `https://html5gameshq.com/iframed/${providerGameId}`
}

export const HTML5GAMESHQ_ATTRIBUTION = {
  label: 'More Games at HTML5GamesHQ',
  url: 'https://html5gameshq.com/?r=embed-ref',
}
