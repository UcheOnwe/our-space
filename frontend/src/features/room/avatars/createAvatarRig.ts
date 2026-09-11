import { Assets, Texture } from 'pixi.js'
import { AvatarRig } from './AvatarRig'
import type { AvatarTextures } from './AvatarRig'
import type { AvatarRigConfig } from './avatarTypes'

export interface LoadedAvatarTextures {
  /** headIdle/bodyBase/arm/leg/bodySitting/bodyLying are the real,
   * fully-loaded textures — sitting/lying are genuinely used by the
   * autonomous behavior loop (see AvatarAutonomyDirector.ts), and at their
   * optimized runtime size (a fraction of a MB each — see
   * scripts/optimize-room-assets.mjs) there's no memory reason to defer
   * them the way `headSad` still is below. `headSad` alone starts out as
   * the harmless `Texture.EMPTY` placeholder below — see `headSadReady`. */
  textures: AvatarTextures
  /** Resolves once the real "sad" head texture has actually finished
   * loading — deliberately NOT awaited by `loadAvatarTextures` itself.
   * Nothing in Our Space currently triggers the 'sad' expression, so
   * making the critical initial load wait on it would only add loading
   * time and (before the runtime asset optimization pass) tens of MB of
   * decoded texture memory for a texture no one is about to see. Pass the
   * resolved value to the constructed rig's `setHeadSadTexture` once ready
   * (see RoomCanvas.tsx) — `Assets.load` caches by URL, so a future real
   * `setExpression('sad')` trigger still shows the correct art immediately
   * once this has resolved, with no extra network fetch. */
  headSadReady: Promise<Texture>
}

/**
 * Loads the textures one character's rig needs for its initial render, plus
 * a lazily-resolving handle for the one texture it doesn't (see
 * `LoadedAvatarTextures` above). Exported on its own (not just bundled into
 * createAvatarRig) because the caller needs to see a real texture's
 * dimensions — specifically to compute one shared baseScale from a single
 * reference character — before either AvatarRig can correctly be
 * constructed. See AvatarRig's constructor docs for why that has to be a
 * shared value rather than computed per-character.
 */
export async function loadAvatarTextures(config: AvatarRigConfig): Promise<LoadedAvatarTextures> {
  const [headIdle, bodyBase, arm, leg, bodySitting, bodyLying] = await Promise.all([
    Assets.load(config.textures.headIdle),
    Assets.load(config.textures.bodyBase),
    Assets.load(config.textures.arm),
    Assets.load(config.textures.leg),
    Assets.load(config.textures.bodySitting),
    Assets.load(config.textures.bodyLying),
  ])
  const headSadReady = Assets.load<Texture>(config.textures.headSad)
  return { textures: { headIdle, headSad: Texture.EMPTY, bodyBase, arm, leg, bodySitting, bodyLying }, headSadReady }
}

/**
 * Loads one character's textures and assembles them into an AvatarRig,
 * wiring up the lazy "sad" head texture the moment it's ready. Convenience
 * wrapper for the common case; requires baseScale to already be known
 * (computed once, shared across both characters — see RoomCanvas.tsx).
 */
export async function createAvatarRig(config: AvatarRigConfig, baseScale: number): Promise<AvatarRig> {
  const { textures, headSadReady } = await loadAvatarTextures(config)
  const rig = new AvatarRig(config, textures, baseScale)
  void headSadReady.then((texture) => rig.setHeadSadTexture(texture))
  return rig
}
