/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { CameraCaptureButton } from '../camera-capture-button'

vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: vi.fn(),
  useIsMobile: vi.fn(),
  useIsTouchDevice: vi.fn(),
}))

const { useIsTouchDevice } = await import('@/hooks/use-media-query')

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('CameraCaptureButton', () => {
  it('renders nothing on non-touch devices', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(false)
    const { container } = render(
      <CameraCaptureButton onChange={vi.fn()} label="Foto aufnehmen" />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders button + hidden input on touch devices', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true)
    const { getByRole, container } = render(
      <CameraCaptureButton
        onChange={vi.fn()}
        label="Foto aufnehmen"
        dataTestId="test-camera"
      />,
    )
    expect(getByRole('button', { name: /Foto aufnehmen/i })).toBeDefined()
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).not.toBeNull()
    expect(input.accept).toBe('image/*')
    expect(input.getAttribute('capture')).toBe('environment')
  })

  it('triggers input click when the button is clicked', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true)
    const { getByRole, container } = render(
      <CameraCaptureButton onChange={vi.fn()} label="Foto aufnehmen" />,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')
    fireEvent.click(getByRole('button'))
    expect(clickSpy).toHaveBeenCalledOnce()
  })

  it('forwards onChange events from the hidden input', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true)
    const onChange = vi.fn()
    const { container } = render(
      <CameraCaptureButton onChange={onChange} label="Foto aufnehmen" />,
    )
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(['x'], 'x.jpg', { type: 'image/jpeg' })] } })
    expect(onChange).toHaveBeenCalledOnce()
  })

  it('propagates disabled state to both input and button', () => {
    vi.mocked(useIsTouchDevice).mockReturnValue(true)
    const { getByRole, container } = render(
      <CameraCaptureButton onChange={vi.fn()} label="Foto aufnehmen" disabled />,
    )
    expect((getByRole('button') as HTMLButtonElement).disabled).toBe(true)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })
})
