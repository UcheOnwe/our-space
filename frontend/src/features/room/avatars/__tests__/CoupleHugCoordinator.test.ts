import { Texture, TextureSource } from 'pixi.js'
import { describe, expect, it, vi } from 'vitest'
import { AvatarAutonomyDirector } from '../AvatarAutonomyDirector'
import { AvatarMotionController } from '../AvatarMotionController'
import { AvatarRig } from '../AvatarRig'
import type { AvatarTextures } from '../AvatarRig'
import { CoupleHugCoordinator } from '../CoupleHugCoordinator'
import type { HugParticipant } from '../CoupleHugCoordinator'
import { FEMALE_AVATAR_CONFIG, MALE_AVATAR_CONFIG } from '../avatarConfigs'
import { HUG_CONVERGE_POINTS, HUG_COOLDOWN_RANGE_SECONDS, HUG_DWELL_RANGE_SECONDS } from '../avatarActivities'

// Vastly exceeds any distance in the room, so a requested walk always
// resolves within a single `update()` call — the same fast-forwarding
// convention the rest of this feature's tests already use.
const FAST_SPEED = 10_000

function fakeTextures(): AvatarTextures {
  return {
    headIdle: Texture.WHITE,
    headSad: Texture.EMPTY,
    bodyBase: Texture.WHITE,
    arm: Texture.WHITE,
    leg: Texture.WHITE,
    bodySitting: new Texture({ source: new TextureSource({ width: 10, height: 10 }) }),
    bodyLying: new Texture({ source: new TextureSource({ width: 10, height: 10 }) }),
  }
}

function makeParticipant(config: typeof MALE_AVATAR_CONFIG, position: { x: number; y: number }): HugParticipant {
  const rig = new AvatarRig(config, fakeTextures(), 1)
  const motion = new AvatarMotionController(rig, config, position, FAST_SPEED)
  const director = new AvatarAutonomyDirector(motion)
  return { rig, motion, director }
}

/** Always returns the same value — deterministic cooldown/dwell picks. */
function constantRandom(value: number): () => number {
  return () => value
}

/**
 * Advances a scene the way RoomCanvas.tsx's real ticker does once a hug is
 * actually under way: both solo directors first (paused by then, so this
 * just advances their motion — see AvatarAutonomyDirector.update's
 * `if (this.paused) return` AFTER advancing motion), then the coordinator.
 *
 * Deliberately NOT used for crossing the cooldown itself (see each test's
 * own comment): while `phase === 'idle'`, `coordinator.update()` only
 * reads each avatar's current (unchanging, since nothing is walking)
 * motion state and counts down its OWN cooldown — it needs neither
 * director ticked at all. Skipping them for that part avoids a real
 * timing hazard: a SOLO idle wait tops out at 8s (avatarActivities.ts's
 * IDLE_DURATION_RANGE_SECONDS), while the hug cooldown minimum is 60s
 * (HUG_COOLDOWN_RANGE_SECONDS) — ticking an UNPAUSED solo director across
 * a 60s+ jump would let it independently choose and start its own
 * activity several times over before the coordinator ever gets a chance
 * to pause it, which is a test-harness timing artifact, not anything
 * about the coordinator's own logic.
 */
function tick(male: HugParticipant, female: HugParticipant, coordinator: CoupleHugCoordinator, deltaSeconds: number): void {
  male.director.update(deltaSeconds)
  female.director.update(deltaSeconds)
  coordinator.update(deltaSeconds)
}

describe('CoupleHugCoordinator', () => {
  it('starts idle, on cooldown, and does not immediately hug even if both avatars are idle', () => {
    const male = makeParticipant(MALE_AVATAR_CONFIG, { x: 500, y: 700 })
    const female = makeParticipant(FEMALE_AVATAR_CONFIG, { x: 520, y: 700 })
    const onHugVisibleChange = vi.fn()
    const coordinator = new CoupleHugCoordinator(male, female, onHugVisibleChange, constantRandom(0.5))

    coordinator.update(0.01)

    expect(coordinator.getPhase()).toBe('idle')
    expect(onHugVisibleChange).not.toHaveBeenCalled()
    expect(male.director.isPaused()).toBe(false)
    expect(female.director.isPaused()).toBe(false)
  })

  it('eligibility: does not start a hug while one avatar is sitting (non-interruptible furniture activity), even once cooldown has elapsed', () => {
    const male = makeParticipant(MALE_AVATAR_CONFIG, { x: 500, y: 700 })
    const female = makeParticipant(FEMALE_AVATAR_CONFIG, { x: 520, y: 700 })
    const coordinator = new CoupleHugCoordinator(male, female, vi.fn(), constantRandom(0))

    male.motion.sitAt({ x: 744, y: 610 })
    // Only the coordinator needs ticking here — see `tick`'s doc comment.
    coordinator.update(HUG_COOLDOWN_RANGE_SECONDS.min + 1)

    expect(coordinator.getPhase()).toBe('idle')
    expect(male.director.isPaused()).toBe(false)
    expect(male.motion.getState()).toBe('sitting') // untouched — not interrupted
  })

  it('eligibility: does not start a hug while one avatar is mid-walk, even once cooldown has elapsed', () => {
    const male = makeParticipant(MALE_AVATAR_CONFIG, { x: 500, y: 700 })
    const female = makeParticipant(FEMALE_AVATAR_CONFIG, { x: 520, y: 700 })
    const coordinator = new CoupleHugCoordinator(male, female, vi.fn(), constantRandom(0))

    male.motion.moveTo({ x: 300, y: 700 }) // a real walk in progress, not yet arrived
    expect(male.motion.getState()).toBe('walking')

    coordinator.update(HUG_COOLDOWN_RANGE_SECONDS.min + 1)

    expect(coordinator.getPhase()).toBe('idle')
  })

  it('both-avatar convergence: once eligible, pauses both directors and walks each to their own converge point', () => {
    const male = makeParticipant(MALE_AVATAR_CONFIG, { x: 500, y: 700 })
    const female = makeParticipant(FEMALE_AVATAR_CONFIG, { x: 520, y: 700 })
    const coordinator = new CoupleHugCoordinator(male, female, vi.fn(), constantRandom(0))

    expect(male.director.isPaused()).toBe(false)
    expect(female.director.isPaused()).toBe(false)

    // Crosses the cooldown threshold — both avatars are still idle at
    // their starting positions the whole time, so nothing here depends on
    // ticking either director.
    coordinator.update(HUG_COOLDOWN_RANGE_SECONDS.min + 1)

    expect(coordinator.getPhase()).toBe('converging')
    expect(male.director.isPaused()).toBe(true)
    expect(female.director.isPaused()).toBe(true)
    // moveTo enters 'walking' synchronously, before any actual motion
    // ticking — proves the coordinator issued the walk, not that it
    // completed.
    expect(male.motion.getState()).toBe('walking')
    expect(female.motion.getState()).toBe('walking')
  })

  it('waits for BOTH avatars to arrive before starting the hug, not just one', () => {
    // Male starts already at his converge point (arrives "for free" once
    // motion is ticked), female starts far away — proves readiness
    // genuinely requires both, not just whichever one gets there first.
    const male = makeParticipant(MALE_AVATAR_CONFIG, HUG_CONVERGE_POINTS.male)
    const female = makeParticipant(FEMALE_AVATAR_CONFIG, { x: 200, y: 700 })
    const onHugVisibleChange = vi.fn()
    const coordinator = new CoupleHugCoordinator(male, female, onHugVisibleChange, constantRandom(0))

    coordinator.update(HUG_COOLDOWN_RANGE_SECONDS.min + 1) // -> converging, both moveTo issued
    expect(coordinator.getPhase()).toBe('converging')
    expect(onHugVisibleChange).not.toHaveBeenCalled()

    // Now both directors are paused (safe to tick — see `tick`'s doc
    // comment) — one real tick, FAST_SPEED, both arrive.
    tick(male, female, coordinator, 1)

    expect(coordinator.getPhase()).toBe('hugging')
    expect(onHugVisibleChange).toHaveBeenCalledWith(true)
  })

  it('does not teleport: convergence is a real walk toward nearby authored points, not a jump across the room', () => {
    const male = makeParticipant(MALE_AVATAR_CONFIG, { x: 250, y: 750 }) // a real wander point, far from the hug area
    const female = makeParticipant(FEMALE_AVATAR_CONFIG, { x: 1150, y: 750 }) // another, far from male
    const coordinator = new CoupleHugCoordinator(male, female, vi.fn(), constantRandom(0))

    coordinator.update(HUG_COOLDOWN_RANGE_SECONDS.min + 1) // requests convergence only

    // Immediately after requesting convergence (before any motion has
    // been ticked), each avatar must still be walking THEIR OWN route
    // toward their own converge point — not already there, not hugging.
    expect(male.motion.getState()).toBe('walking')
    expect(female.motion.getState()).toBe('walking')
    expect(coordinator.getPhase()).toBe('converging')
  })

  it('hug start/end: hides both rigs on start and restores them on end', () => {
    const male = makeParticipant(MALE_AVATAR_CONFIG, HUG_CONVERGE_POINTS.male)
    const female = makeParticipant(FEMALE_AVATAR_CONFIG, HUG_CONVERGE_POINTS.female)
    const onHugVisibleChange = vi.fn()
    const coordinator = new CoupleHugCoordinator(male, female, onHugVisibleChange, constantRandom(0))

    coordinator.update(HUG_COOLDOWN_RANGE_SECONDS.min + 1) // -> converging (both already at their points)
    tick(male, female, coordinator, 0.01) // confirms arrival -> hugging

    expect(coordinator.getPhase()).toBe('hugging')
    expect(male.rig.container.visible).toBe(false)
    expect(female.rig.container.visible).toBe(false)
    expect(onHugVisibleChange).toHaveBeenLastCalledWith(true)

    tick(male, female, coordinator, HUG_DWELL_RANGE_SECONDS.max + 1) // dwell elapses

    expect(coordinator.getPhase()).toBe('idle')
    expect(male.rig.container.visible).toBe(true)
    expect(female.rig.container.visible).toBe(true)
    expect(onHugVisibleChange).toHaveBeenLastCalledWith(false)
  })

  it('restores independent rigs and RESUMES both directors after the hug ends', () => {
    const male = makeParticipant(MALE_AVATAR_CONFIG, HUG_CONVERGE_POINTS.male)
    const female = makeParticipant(FEMALE_AVATAR_CONFIG, HUG_CONVERGE_POINTS.female)
    const coordinator = new CoupleHugCoordinator(male, female, vi.fn(), constantRandom(0))

    coordinator.update(HUG_COOLDOWN_RANGE_SECONDS.min + 1) // -> converging
    tick(male, female, coordinator, 0.01) // -> hugging
    expect(male.director.isPaused()).toBe(true)
    expect(female.director.isPaused()).toBe(true)

    tick(male, female, coordinator, HUG_DWELL_RANGE_SECONDS.max + 1) // -> ends

    expect(male.director.isPaused()).toBe(false)
    expect(female.director.isPaused()).toBe(false)
    expect(male.motion.getState()).toBe('idle')
    expect(female.motion.getState()).toBe('idle')
  })

  it('cooldown prevents an immediate repeated hug right after one ends', () => {
    const male = makeParticipant(MALE_AVATAR_CONFIG, HUG_CONVERGE_POINTS.male)
    const female = makeParticipant(FEMALE_AVATAR_CONFIG, HUG_CONVERGE_POINTS.female)
    const onHugVisibleChange = vi.fn()
    const coordinator = new CoupleHugCoordinator(male, female, onHugVisibleChange, constantRandom(0))

    coordinator.update(HUG_COOLDOWN_RANGE_SECONDS.min + 1) // -> converging
    tick(male, female, coordinator, 0.01) // -> hugging
    tick(male, female, coordinator, HUG_DWELL_RANGE_SECONDS.max + 1) // -> ends, fresh cooldown starts (both directors resumed)
    onHugVisibleChange.mockClear()

    // Both avatars are idle again immediately (resume put them at idle in
    // place). Now BOTH directors are unpaused again, so from here on this
    // test itself is subject to the same "solo idle tops out at 8s"
    // consideration `tick`'s doc comment describes — but that's fine here:
    // either avatar independently wandering off is itself additional
    // proof the fresh cooldown is blocking a hug, not a confound. A 1s
    // step is far short of even the shortest solo idle wait, so neither
    // has moved yet either way.
    tick(male, female, coordinator, 1)

    expect(coordinator.getPhase()).toBe('idle')
    expect(onHugVisibleChange).not.toHaveBeenCalled()
  })

  it('is deterministic: the same random source produces the same phase sequence', () => {
    const run = () => {
      const male = makeParticipant(MALE_AVATAR_CONFIG, HUG_CONVERGE_POINTS.male)
      const female = makeParticipant(FEMALE_AVATAR_CONFIG, HUG_CONVERGE_POINTS.female)
      const coordinator = new CoupleHugCoordinator(male, female, vi.fn(), constantRandom(0.3))
      const phases: string[] = []
      const cooldown = HUG_COOLDOWN_RANGE_SECONDS.min + 0.3 * (HUG_COOLDOWN_RANGE_SECONDS.max - HUG_COOLDOWN_RANGE_SECONDS.min)
      coordinator.update(cooldown + 1)
      phases.push(coordinator.getPhase())
      tick(male, female, coordinator, 0.01)
      phases.push(coordinator.getPhase())
      return phases
    }

    expect(run()).toEqual(run())
  })
})
