import { describe, expect, it } from 'vitest'
import { GAME_CATALOG, GAMEZOP_GAMES } from '../gameCatalog'
import { resolveGameLaunchUrl } from '../launch'

describe('GAME_CATALOG (the active, deployable catalog)', () => {
  it('has exactly the three currently deployable games', () => {
    expect(GAME_CATALOG.map((game) => game.name).sort()).toEqual(
      ['8 Ball Pool Multiplayer', 'Basketball Stars', 'Physics Drop'].sort(),
    )
  })

  it('puts 8 Ball Pool Multiplayer and Basketball Stars under Play Together', () => {
    const together = GAME_CATALOG.filter((game) => game.category === 'together').map((game) => game.name)
    expect(together.sort()).toEqual(['8 Ball Pool Multiplayer', 'Basketball Stars'].sort())
  })

  it('puts Physics Drop under Play Solo', () => {
    const solo = GAME_CATALOG.filter((game) => game.category === 'solo').map((game) => game.name)
    expect(solo).toEqual(['Physics Drop'])
  })

  it('gives every game a provider id and no embedded credentials/secrets', () => {
    for (const game of GAME_CATALOG) {
      expect(game.providerGameId).toBeTruthy()
      const serialized = JSON.stringify(game).toLowerCase()
      expect(serialized).not.toMatch(/key|token|secret|password|credential/)
    }
  })

  it('never launches a game through the Gamezop evaluation environment', () => {
    for (const game of GAME_CATALOG) {
      expect(game.provider).not.toBe('gamezop')
      expect(resolveGameLaunchUrl(game)).not.toContain('gamezop.com')
    }
  })

  it('resolves each game to its real, provider-published embed URL, isolated from the catalog data itself', () => {
    const eightBallPool = GAME_CATALOG.find((game) => game.id === '8-ball-pool-multiplayer')!
    expect(resolveGameLaunchUrl(eightBallPool)).toBe('https://html5gameshq.com/iframed/8-ball-pool-multiplayer')

    const basketballStars = GAME_CATALOG.find((game) => game.id === 'basketball-stars')!
    expect(resolveGameLaunchUrl(basketballStars)).toBe('https://html5gameshq.com/iframed/basketball-stars')

    const physicsDrop = GAME_CATALOG.find((game) => game.id === 'physics-drop')!
    expect(resolveGameLaunchUrl(physicsDrop)).toBe('https://spritted.com/en/game/physics-drop?embed')
  })

  it('does not truthfully describe any active game as automatic remote couple matchmaking', () => {
    for (const game of GAME_CATALOG) {
      expect(game.description.toLowerCase()).not.toMatch(/play (directly )?with your partner/)
    }
  })
})

describe('GAMEZOP_GAMES (preserved, inactive pending publisher access)', () => {
  it('still resolves through the Gamezop provider, ready to restore later', () => {
    const ludo = GAMEZOP_GAMES.find((game) => game.id === 'ludo-with-friends')!
    expect(resolveGameLaunchUrl(ludo)).toBe('https://zv1y2i8p.play.gamezop.com/g/SkhljT2fdgb')
  })

  it('is not part of the active catalog the app actually renders', () => {
    const activeIds = new Set(GAME_CATALOG.map((game) => game.id))
    for (const game of GAMEZOP_GAMES) {
      expect(activeIds.has(game.id)).toBe(false)
    }
  })
})
