import type { ColorVariantId, CompanionTypeId } from '../../companions/types'

/** The shape returned by both GET and PATCH /api/companions/profile/ —
 * matches companions.serializers.CompanionProfileSerializer field-for-field. */
export interface CompanionProfileData {
  companion_type: CompanionTypeId
  color_variant: ColorVariantId
  updated_at: string
}
