import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AnalogCameraControl } from '../AnalogCameraControl'

function mockJoystickBase(joystick: HTMLElement) {
  vi.spyOn(joystick, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 100,
    top: 250,
    left: 20,
    right: 120,
    bottom: 350,
    x: 20,
    y: 250,
    toJSON() {},
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AnalogCameraControl', () => {
  it('reports a zero vector before any interaction', () => {
    const onVectorChange = vi.fn()
    render(<AnalogCameraControl onVectorChange={onVectorChange} onRecenter={vi.fn()} />)
    expect(onVectorChange).not.toHaveBeenCalled()
  })

  it('reports a non-zero vector while the knob is displaced past the dead zone', () => {
    const onVectorChange = vi.fn()
    render(<AnalogCameraControl onVectorChange={onVectorChange} onRecenter={vi.fn()} />)
    const joystick = screen.getByLabelText('Explore the environment')
    mockJoystickBase(joystick)

    // Center is (70, 300) — push fully right.
    fireEvent.pointerDown(joystick, { pointerId: 1, clientX: 120, clientY: 300 })

    const lastCall = onVectorChange.mock.calls.at(-1)![0]
    expect(lastCall.x).toBeGreaterThan(0)
    expect(lastCall.y).toBe(0)
  })

  it('reports {0,0} on release', () => {
    const onVectorChange = vi.fn()
    render(<AnalogCameraControl onVectorChange={onVectorChange} onRecenter={vi.fn()} />)
    const joystick = screen.getByLabelText('Explore the environment')
    mockJoystickBase(joystick)

    fireEvent.pointerDown(joystick, { pointerId: 1, clientX: 120, clientY: 300 })
    fireEvent.pointerUp(joystick, { pointerId: 1, clientX: 120, clientY: 300 })

    expect(onVectorChange).toHaveBeenLastCalledWith({ x: 0, y: 0 })
  })

  it('reports {0,0} on pointercancel — a real device interrupting the gesture (an incoming call, an OS gesture) must stop the camera, not leave it stuck moving', () => {
    const onVectorChange = vi.fn()
    render(<AnalogCameraControl onVectorChange={onVectorChange} onRecenter={vi.fn()} />)
    const joystick = screen.getByLabelText('Explore the environment')
    mockJoystickBase(joystick)

    fireEvent.pointerDown(joystick, { pointerId: 1, clientX: 120, clientY: 300 })
    fireEvent.pointerCancel(joystick, { pointerId: 1, clientX: 120, clientY: 300 })

    expect(onVectorChange).toHaveBeenLastCalledWith({ x: 0, y: 0 })
  })

  it('reports {0,0} when pointer capture is lost without an explicit up/cancel', () => {
    const onVectorChange = vi.fn()
    render(<AnalogCameraControl onVectorChange={onVectorChange} onRecenter={vi.fn()} />)
    const joystick = screen.getByLabelText('Explore the environment')
    mockJoystickBase(joystick)

    fireEvent.pointerDown(joystick, { pointerId: 1, clientX: 120, clientY: 300 })
    // A plain `Event` has no `pointerId` — release() checks that it
    // matches the tracked pointer, so this must be a real PointerEvent to
    // exercise the actual code path rather than silently no-op-ing.
    fireEvent(joystick, new PointerEvent('lostpointercapture', { bubbles: true, pointerId: 1 }))

    expect(onVectorChange).toHaveBeenLastCalledWith({ x: 0, y: 0 })
  })

  it("never lets the knob's own visual position exceed the base radius, even for a finger far outside it", () => {
    const { container } = render(<AnalogCameraControl onVectorChange={vi.fn()} onRecenter={vi.fn()} />)
    const joystick = screen.getByLabelText('Explore the environment')
    mockJoystickBase(joystick)
    const knob = container.querySelector('[class*="knob"]') as HTMLElement

    // Center (70, 300), radius 50 — this finger position is 500px away.
    fireEvent.pointerDown(joystick, { pointerId: 1, clientX: 570, clientY: 300 })

    const match = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(knob.style.transform)
    expect(match).not.toBeNull()
    const [, x, y] = match!
    expect(Math.hypot(Number(x), Number(y))).toBeLessThanOrEqual(50 + 0.001)
  })

  it('the knob returns to center on release', () => {
    const { container } = render(<AnalogCameraControl onVectorChange={vi.fn()} onRecenter={vi.fn()} />)
    const joystick = screen.getByLabelText('Explore the environment')
    mockJoystickBase(joystick)
    const knob = container.querySelector('[class*="knob"]') as HTMLElement

    fireEvent.pointerDown(joystick, { pointerId: 1, clientX: 120, clientY: 300 })
    expect(knob.style.transform).not.toBe('translate(0px, 0px)')

    fireEvent.pointerUp(joystick, { pointerId: 1, clientX: 120, clientY: 300 })
    expect(knob.style.transform).toBe('translate(0px, 0px)')
  })

  it('calls onRecenter when the Recenter control is clicked', () => {
    const onRecenter = vi.fn()
    render(<AnalogCameraControl onVectorChange={vi.fn()} onRecenter={onRecenter} />)
    fireEvent.click(screen.getByLabelText('Recenter view'))
    expect(onRecenter).toHaveBeenCalledTimes(1)
  })

  it('leaves the default bottom offset alone when bottomOffsetPx is omitted', () => {
    const { container } = render(<AnalogCameraControl onVectorChange={vi.fn()} onRecenter={vi.fn()} />)
    const cluster = container.querySelector('[class*="cluster"]') as HTMLElement
    expect(cluster.style.getPropertyValue('--analog-bottom-offset')).toBe('')
  })

  it('applies a custom bottom offset when given — for a consumer whose own UI occupies the bottom of the same viewport (RoomGallery, via RoomPosterPreview)', () => {
    const { container } = render(<AnalogCameraControl onVectorChange={vi.fn()} onRecenter={vi.fn()} bottomOffsetPx={190} />)
    const cluster = container.querySelector('[class*="cluster"]') as HTMLElement
    expect(cluster.style.getPropertyValue('--analog-bottom-offset')).toBe('190px')
  })
})
