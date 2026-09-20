import { useRef } from 'react'
import { render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useAmbientVideoAutoplay } from '../useAmbientVideoAutoplay'

function TestVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)
  useAmbientVideoAutoplay(videoRef)
  return <video ref={videoRef} data-testid="video" />
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAmbientVideoAutoplay', () => {
  it('calls play() once the video element exists', () => {
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
    render(<TestVideo />)
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('retries play() exactly once on the next pointerdown after autoplay is rejected', async () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValueOnce(new Error('NotAllowedError'))
      .mockResolvedValueOnce(undefined)

    render(<TestVideo />)
    // Let the initial play() promise's rejection actually resolve before
    // the interaction listener is expected to be attached.
    await Promise.resolve()
    await Promise.resolve()

    document.dispatchEvent(new Event('pointerdown'))
    expect(play).toHaveBeenCalledTimes(2)

    // The listener is one-shot — a second interaction must not call
    // play() a third time.
    document.dispatchEvent(new Event('pointerdown'))
    expect(play).toHaveBeenCalledTimes(2)
  })
})
