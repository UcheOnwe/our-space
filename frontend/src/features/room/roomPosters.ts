/**
 * A static preview image for rooms whose gallery hero preview is a still
 * image rather than a live component. Keyed by the backend's own
 * room_type identifier (see backend/rooms/models.py's RoomType).
 *
 * Couple Home's poster is DELIBERATELY NOT room_environment_base.png (the
 * runtime environment backplate RoomCanvas.tsx actually renders) — that
 * asset has its furniture removed into separate layers for the
 * interactive Pixi room (see roomAssets.ts), which reads as an
 * incomplete/broken room when shown as a flat still image. This is
 * instead an UNCHANGED runtime copy of art-source/
 * upscaledROOMourspace_upscayl_2x_digital-art-4x.png — the complete,
 * fully-composited artwork with every piece already painted in, verified
 * by direct visual inspection (not filename alone; a sibling file with a
 * similar name, scaleguideRoom_*, turned out to be an annotated
 * grid/measurement reference, not a usable preview). No image-resizing
 * tool was available on this machine (same situation as Cozy Loft's
 * unoptimized video copy) — this is a straight, undownsized copy; worth
 * optimizing later. RoomCanvas.tsx's own layered runtime assets and
 * rendering are completely untouched by this — this file only affects
 * the gallery's browsing preview.
 *
 * Cozy Loft has NO entry here — its gallery hero preview reuses the
 * actual live CozyLoftRoom video component instead (see RoomGallery.tsx),
 * since extracting a poster frame needs ffmpeg, which isn't available on
 * this machine either — showing the real playing loop is the honest
 * substitute.
 */
export const ROOM_POSTER_SRC: Record<string, string> = {
  couple_home: '/room/couple-home-full-preview.png',
}
