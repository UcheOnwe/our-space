export type Avatar = 'A' | 'B'

/** The only screens Shared Presence supports — matches the backend's
 * ALLOWED_FEATURES allowlist exactly (see presence/consumers.py). Adding a
 * future screen (Games, Fitness, ...) is a new key in both this type and
 * FEATURE_LABELS below, not a restructure. */
export type FeatureName = 'home' | 'watch'

/** User-facing name for a partner's location label. Kept as one small,
 * explicit lookup — never derived/guessed — so a feature this app doesn't
 * recognize simply can't render a fabricated label. */
export const FEATURE_LABELS: Record<FeatureName, string> = {
  home: 'Couple Home',
  watch: 'Watch Together',
}

/** Whether a locally- or remotely-covered-by-video avatar should render.
 * Deliberately not part of `online` — this is a temporary visual
 * concealment while still fully present in the feature, not a
 * disconnect. */
export type Visibility = 'visible' | 'video-hidden'

export interface SelfInfo {
  userId: number
  avatar: Avatar
}

export interface PartnerInfo {
  userId: number
  avatar: Avatar
  online: boolean
  x: number
  y: number
  /** False while the partner's own avatar is covering their video player.
   * Only meaningful when `online` — see the Watch Together video-suppression
   * design notes. */
  visible: boolean
  /** Which feature the partner is currently connected to, if any — null
   * when they're not connected anywhere in Our Space right now. Only
   * meaningful when NOT `online` (if they were online here, they'd be in
   * this same feature by definition); drives the sleeping partner's
   * location label. */
  currentFeature: FeatureName | null
}

/** Messages the server sends us — one variant per `type`, discriminated on it. */
export type ServerMessage =
  | { type: 'presence.state'; self: SelfInfo; partner: PartnerInfo | null }
  | { type: 'presence.join'; userId: number; avatar: Avatar }
  | { type: 'presence.move'; userId: number; avatar: Avatar; x: number; y: number }
  | { type: 'presence.leave'; userId: number }
  | { type: 'presence.click'; x: number; y: number }
  | { type: 'interaction.hug'; fromUserId: number }
  | { type: 'presence.visibility'; userId: number; state: Visibility }
  | { type: 'presence.location'; userId: number; feature: FeatureName | null }

/** Messages we're allowed to send — deliberately carry no identity fields;
 * the server always determines "who sent this" from the authenticated
 * connection itself, never from the message body. */
export type ClientMessage =
  | { type: 'presence.move'; x: number; y: number }
  | { type: 'presence.click'; x: number; y: number }
  | { type: 'interaction.hug' }
  | { type: 'presence.visibility'; state: Visibility }

/** A currently-playing interaction, e.g. a hug. A small discriminated union
 * (not a boolean like `showHug`) so a future reaction (kiss, poke, ...) is
 * a new variant here, not a redesign. */
export type ActiveInteraction = { kind: 'hug'; fromUserId: number; startedAt: number }
