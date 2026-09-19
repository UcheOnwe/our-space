import { apiClient } from '../../api/client'
import type { RoomGalleryItem } from './types'

/** The couple's room collection/discovery surface — both owned and
 * locked rooms, in stable carousel order. Rejects with an ApiError (400)
 * if the caller isn't currently paired. */
export function fetchRoomGallery(): Promise<RoomGalleryItem[]> {
  return apiClient.get('/rooms/gallery/')
}

/** Unlocks `roomType` for the caller's couple (spending from the Couple
 * Wallet only) if not already owned, then makes it the active room
 * either way. Returns the updated gallery, same shape as fetchRoomGallery. */
export function purchaseRoom(roomType: string): Promise<RoomGalleryItem[]> {
  return apiClient.post('/rooms/purchase/', { room_type: roomType })
}

/** Makes an already-owned room active. Rejects with an ApiError (400) if
 * the couple hasn't unlocked `roomType`. Returns the updated gallery. */
export function selectActiveRoom(roomType: string): Promise<RoomGalleryItem[]> {
  return apiClient.post('/rooms/select-active/', { room_type: roomType })
}
