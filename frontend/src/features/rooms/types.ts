/** One entry in the room gallery — matches
 * rooms.serializers.RoomGalleryItemSerializer field-for-field. Returned,
 * in this same shape, by GET /api/rooms/gallery/ and by both POST
 * mutation endpoints below, so the caller never needs a second request
 * to see the up-to-date state after a purchase/selection.
 *
 * `order` is a stable, backend-authoritative sort key for the future
 * carousel's left/right navigation — not something the frontend should
 * ever compute or reorder itself. */
export interface RoomGalleryItem {
  room_type: string
  display_name: string
  order: number
  price: number
  is_owned: boolean
  is_active: boolean
}
