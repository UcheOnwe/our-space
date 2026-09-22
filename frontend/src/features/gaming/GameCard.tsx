import type { Game } from './types'
import styles from './GameCard.module.css'

interface GameCardProps {
  game: Game
  onPlay: (game: Game) => void
}

/** One game's card — artwork, name, a short description, and an obvious
 * Play action. Deliberately this small: the catalog can grow to 20+
 * entries later without this component changing at all, since it only
 * ever renders exactly one Game it's handed. */
export function GameCard({ game, onPlay }: GameCardProps) {
  return (
    <div className={styles.card}>
      {game.artworkUrl && <img className={styles.artwork} src={game.artworkUrl} alt="" aria-hidden="true" />}
      <div className={styles.body}>
        <h4 className={styles.name}>{game.name}</h4>
        <p className={styles.description}>{game.description}</p>
        <button type="button" className={styles.playButton} onClick={() => onPlay(game)}>
          ▶ Play
        </button>
      </div>
    </div>
  )
}
