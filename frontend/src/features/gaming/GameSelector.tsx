import { GameCard } from './GameCard'
import { GAME_CATALOG } from './gameCatalog'
import type { Game, GameCategory } from './types'
import styles from './GameSelector.module.css'

interface GameSelectorProps {
  onSelectGame: (game: Game) => void
}

// Order matters here (Together before Solo, per the approved layout) —
// GAME_CATALOG itself stays a flat, unordered-by-category array.
const CATEGORY_ORDER: GameCategory[] = ['together', 'solo']
const CATEGORY_LABELS: Record<GameCategory, string> = {
  together: 'Play Together',
  solo: 'Play Solo',
}

/**
 * The Gaming close-up's game selector — grouped sections over the
 * gaming-room video, each holding whatever GAME_CATALOG entries share
 * that category. Adding a 4th, 10th, or 20th game is a new
 * gameCatalog.ts entry; adding a 3rd category is one more entry in
 * CATEGORY_ORDER/CATEGORY_LABELS — neither touches this component's own
 * structure, which is the point of keeping the layout section-driven
 * instead of two hardcoded lists.
 */
export function GameSelector({ onSelectGame }: GameSelectorProps) {
  return (
    <div className={styles.selector}>
      {CATEGORY_ORDER.map((category) => {
        const games = GAME_CATALOG.filter((game) => game.category === category)
        if (games.length === 0) return null
        return (
          <section key={category} className={styles.section}>
            <h4 className={styles.sectionTitle}>{CATEGORY_LABELS[category]}</h4>
            <div className={styles.cards}>
              {games.map((game) => (
                <GameCard key={game.id} game={game} onPlay={onSelectGame} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
