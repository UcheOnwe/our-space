/**
 * Spritted-specific launch URL construction — copied directly from the
 * exact embed code Spritted's own webmasters catalog shows for this game
 * (https://spritted.com/en/webmasters/embed/physics-drop), not guessed
 * from a pattern. Their own published snippet is:
 *
 *   <iframe align="center" frameborder="0" allowtransparency="true"
 *     scrolling="no"
 *     src="https://spritted.com/en/game/physics-drop?embed"
 *     width="960px" height="600px"></iframe>
 *
 * Notably a DIFFERENT URL shape than HTML5GamesHQ's own
 * (`/en/game/<slug>?embed`, the regular game page plus a query flag —
 * not a dedicated `/embed/` or `/iframed/` path) — confirming why this
 * had to be verified per-provider rather than assumed from one pattern.
 */
export function buildSprittedLaunchUrl(providerGameId: string): string {
  return `https://spritted.com/en/game/${providerGameId}?embed`
}
