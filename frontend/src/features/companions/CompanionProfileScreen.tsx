import { useEffect, useState } from 'react'
import { ApiError } from '../../api/client'
import { COLOR_VARIANTS, COMPANION_TYPES, DEFAULT_COMPANION_TYPE } from '../../companions/registry'
import type { ColorVariantId, CompanionTypeId } from '../../companions/types'
import { fetchCompanionProfile, updateCompanionSelection } from './api'
import { notifyExtensionOfEquippedCompanion } from './extensionSync'
import styles from './CompanionProfileScreen.module.css'

const COMPANION_TYPE_ORDER: CompanionTypeId[] = [
  'cosmic_blob',
  'cosmic_flyer',
  'mini_ufo',
  'star_wisp',
  'nova_guardian',
]

interface EquippedSelection {
  companionType: CompanionTypeId
  colorVariant: ColorVariantId
}

export function CompanionProfileScreen() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // "Equipped" is the last value the SERVER confirmed (on load, and after
  // a successful Save) — "draft" is whatever the user is currently
  // previewing, which may not be saved yet. Keeping these separate is
  // what lets the UI show both "what you're looking at" and "what's
  // actually equipped" (the approved plan's own "selected/equipped
  // state" requirement) instead of conflating the two.
  const [equipped, setEquipped] = useState<EquippedSelection | null>(null)
  const [draftType, setDraftType] = useState<CompanionTypeId>(DEFAULT_COMPANION_TYPE)
  const [draftColor, setDraftColor] = useState<ColorVariantId>(COMPANION_TYPES[DEFAULT_COMPANION_TYPE].defaultColor)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const profile = await fetchCompanionProfile()
        if (cancelled) return
        setEquipped({ companionType: profile.companion_type, colorVariant: profile.color_variant })
        setDraftType(profile.companion_type)
        setDraftColor(profile.color_variant)
        setStatus('ready')
        // Re-syncs the extension's cache to the backend's current truth
        // just from VISITING this page — not only after an actual Save —
        // so the two stay consistent even if the extension's cache was
        // stale or empty (e.g. first install).
        notifyExtensionOfEquippedCompanion(profile.companion_type, profile.color_variant)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof ApiError ? err.message : 'Unable to load your Companion Profile.')
        setStatus('error')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  function handleSelectCompanion(companionType: CompanionTypeId) {
    setDraftType(companionType)
    const definition = COMPANION_TYPES[companionType]
    // The previously-selected color may not exist on the newly-chosen
    // Companion (decision #4: per-Companion color availability) — fall
    // back to that Companion's own default rather than carrying over an
    // invalid combination.
    if (!definition.allowedColors.includes(draftColor)) {
      setDraftColor(definition.defaultColor)
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const profile = await updateCompanionSelection(draftType, draftColor)
      setEquipped({ companionType: profile.companion_type, colorVariant: profile.color_variant })
      notifyExtensionOfEquippedCompanion(profile.companion_type, profile.color_variant)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save your Companion selection.')
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') {
    return <p>Loading your Companion…</p>
  }

  if (status === 'error' && !equipped) {
    return <p role="alert">{error}</p>
  }

  const draftDefinition = COMPANION_TYPES[draftType]
  const isDirty = equipped ? draftType !== equipped.companionType || draftColor !== equipped.colorVariant : false

  return (
    <div className={styles.screen}>
      <section className={styles.previewPanel}>
        <div
          className={`${styles.previewCreature} ${styles[draftDefinition.animationPreset]}`}
          // The shared registry's own SVG builder returns markup this app
          // generated itself (never user input) — see companionShapes.ts's
          // doc comment for why dangerouslySetInnerHTML is the deliberate,
          // safe choice here rather than a second JSX reimplementation of
          // the same four shapes.
          dangerouslySetInnerHTML={{
            __html: draftDefinition.buildSvgMarkup(draftColor, COLOR_VARIANTS[draftColor].hex),
          }}
        />
        <p className={styles.previewName}>{draftDefinition.displayName}</p>
        <p className={styles.previewDescription}>{draftDefinition.description}</p>
      </section>

      <section className={styles.section}>
        <h2>Choose your Companion</h2>
        <div className={styles.companionGrid}>
          {COMPANION_TYPE_ORDER.map((typeId) => {
            const definition = COMPANION_TYPES[typeId]
            const isSelected = draftType === typeId
            const isEquipped = equipped?.companionType === typeId
            return (
              <button
                key={typeId}
                type="button"
                className={`${styles.companionCard} ${isSelected ? styles.companionCardSelected : ''}`}
                onClick={() => handleSelectCompanion(typeId)}
                aria-pressed={isSelected}
              >
                <span
                  className={styles.companionCardIcon}
                  dangerouslySetInnerHTML={{
                    __html: definition.buildSvgMarkup(
                      definition.defaultColor,
                      COLOR_VARIANTS[definition.defaultColor].hex,
                    ),
                  }}
                />
                <span className={styles.companionCardName}>{definition.displayName}</span>
                {isEquipped && <span className={styles.equippedBadge}>Equipped</span>}
              </button>
            )
          })}
        </div>
      </section>

      <section className={styles.section}>
        <h2>Color</h2>
        <div className={styles.swatchRow}>
          {draftDefinition.allowedColors.map((colorId) => {
            const color = COLOR_VARIANTS[colorId]
            const isSelected = draftColor === colorId
            const isEquipped = equipped?.companionType === draftType && equipped?.colorVariant === colorId
            // "Default" isn't one flat color (see companionShapes.ts's
            // buildCosmicBlobSvg) — its swatch shows the same gradient
            // treatment instead of a plain fill, so it reads as visually
            // distinct from an ordinary recolor choice.
            const swatchStyle =
              colorId === 'default'
                ? { background: 'linear-gradient(180deg, #c98f8a 0%, #7a8450 100%)' }
                : { backgroundColor: color.hex }
            return (
              <button
                key={colorId}
                type="button"
                className={`${styles.swatch} ${isSelected ? styles.swatchSelected : ''}`}
                style={swatchStyle}
                onClick={() => setDraftColor(colorId)}
                aria-pressed={isSelected}
                aria-label={color.label}
                title={color.label}
              >
                {isEquipped && <span className={styles.swatchEquippedDot} aria-hidden="true" />}
              </button>
            )
          })}
        </div>
      </section>

      {error && <p role="alert">{error}</p>}

      <div className={styles.actions}>
        <button type="button" className={styles.saveButton} onClick={handleSave} disabled={saving || !isDirty}>
          {saving ? 'Saving…' : 'Save & Equip'}
        </button>
        {!isDirty && equipped && <span className={styles.upToDateNote}>Up to date</span>}
      </div>
    </div>
  )
}
