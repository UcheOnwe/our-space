import { apiClient } from '../../api/client'
import type { ColorVariantId, CompanionTypeId } from '../../companions/types'
import type { CompanionProfileData } from './types'

/** The caller's own Companion Profile — lazily created server-side on
 * first access (see backend/companions/services.py), so this never 404s. */
export function fetchCompanionProfile(): Promise<CompanionProfileData> {
  return apiClient.get('/companions/profile/')
}

/** Sets the caller's equipped companion_type AND color_variant together —
 * the "Save/Equip" action always commits one complete selection at once. */
export function updateCompanionSelection(
  companionType: CompanionTypeId,
  colorVariant: ColorVariantId,
): Promise<CompanionProfileData> {
  return apiClient.patch('/companions/profile/', {
    companion_type: companionType,
    color_variant: colorVariant,
  })
}
