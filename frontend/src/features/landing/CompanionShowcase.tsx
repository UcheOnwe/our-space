import { COMPANION_TYPES } from '../../companions/registry'
import type { CompanionTypeId } from '../../companions/types'
import { CompanionMascot } from './CompanionMascot'
import { useScrollReveal } from './useScrollReveal'
import { FullBleedSection } from './FullBleedSection'
import styles from './CompanionShowcase.module.css'

const SHOWCASE_ORDER: CompanionTypeId[] = ['cosmic_blob', 'cosmic_flyer', 'mini_ufo', 'star_wisp', 'nova_guardian']
const MOTIONS = ['float', 'hover', 'drift', 'float', 'hover'] as const

/**
 * All 5 REAL registry Companions — no invented characters, no rasterized
 * concept art. Cosmic Blob (the actual default) is visually first and
 * largest, matching its role as the primary mascot everywhere else on
 * this page; the other four appear as genuine alternatives someone can
 * equip today (see companions/registry.ts).
 */
export function CompanionShowcase() {
  const { ref, isVisible } = useScrollReveal<HTMLDivElement>()

  return (
    <FullBleedSection background="var(--accent-bg)">
      <div ref={ref} className={`${styles.wrap} ${isVisible ? styles.visible : ''}`}>
        <h2 className={styles.headline}>Choose your Companion.</h2>
        <p className={styles.body}>Every space starts with one. Equip whichever one feels like you.</p>
        <div className={styles.lineup}>
          {SHOWCASE_ORDER.map((id, index) => (
            <div
              key={id}
              className={`${styles.card} ${id === 'cosmic_blob' ? styles.cardPrimary : ''}`}
              style={{ transitionDelay: isVisible ? `${index * 80}ms` : '0ms' }}
            >
              <div className={styles.companion}>
                <CompanionMascot type={id} motion={MOTIONS[index]} />
              </div>
              <span className={styles.name}>{COMPANION_TYPES[id].displayName}</span>
            </div>
          ))}
        </div>
      </div>
    </FullBleedSection>
  )
}
