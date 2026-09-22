import { useState } from 'react'
import { GamePlayer } from './GamePlayer'
import { GameSelector } from './GameSelector'
import type { Game } from './types'
import styles from './GamingActivity.module.css'

/**
 * The Gaming close-up's own activity content — CozyLoftRoom.tsx renders
 * this exactly where its old placeholder "Choose a Game" shell used to
 * sit, inside RoomCloseUp's activity area. Owns one small piece of LOCAL
 * state (which game, if any, is being played) that is entirely separate
 * from the room/hotspot state machine (useRoomHotspotInteraction) — this
 * is what gives "Back to Games" (goes back to the selector) and "Back to
 * Room" (RoomCloseUp's own existing control, unrelated to this
 * component) two independent, non-competing meanings:
 *
 *   Game -> Back to Games -> Gaming selector -> Back to Room -> Cozy Loft
 */
export function GamingActivity() {
  const [selectedGame, setSelectedGame] = useState<Game | null>(null)

  return (
    <div className={styles.activity}>
      {selectedGame ? (
        <GamePlayer game={selectedGame} onBackToGames={() => setSelectedGame(null)} />
      ) : (
        <GameSelector onSelectGame={setSelectedGame} />
      )}
    </div>
  )
}
