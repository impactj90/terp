/**
 * @vitest-environment jsdom
 *
 * Unit tests for the SignaturePad component (Phase 6).
 *
 * JSDOM does not implement the Canvas API, which `react-signature-canvas`
 * depends on for pointer tracking. We therefore mock the underlying
 * `SignatureCanvas` class so we can exercise the imperative-handle surface
 * (`isEmpty`, `toPng`, `clear`) and the "Signatur löschen" button wiring
 * without needing a real canvas. The full pen-flow runs in Playwright
 * (Phase 8) where Chromium provides a real canvas context.
 *
 * Plan: 2026-04-22-workreport-arbeitsschein-m1.md (Phase 6)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createRef } from "react"

// Mock `react-signature-canvas` with a lightweight React component that
// exposes the same method surface we consume (`isEmpty`, `toDataURL`,
// `toData`, `clear`). Each mock instance is tracked in a module-level
// array so individual tests can tweak the behavior of the most recent
// instance.
interface MockCanvas {
  empty: boolean
  data: unknown[]
  dataUrl: string
  clearCalls: number
  /** Captured `onEnd` prop — tests invoke this to simulate a stroke ending. */
  onEnd?: (event: MouseEvent) => void
  isEmpty: () => boolean
  toDataURL: (type?: string) => string
  toData: () => unknown[]
  clear: () => void
}

const mockInstances: MockCanvas[] = []

vi.mock("react-signature-canvas", async () => {
  const React = await import("react")

  interface SignatureCanvasProps {
    canvasProps?: React.CanvasHTMLAttributes<HTMLCanvasElement>
    penColor?: string
    backgroundColor?: string
    onEnd?: (event: MouseEvent) => void
  }

  class SignatureCanvasMock
    extends React.Component<SignatureCanvasProps>
    implements MockCanvas
  {
    empty = true
    data: unknown[] = []
    dataUrl = "data:image/png;base64,AAAA"
    clearCalls = 0
    onEnd?: (event: MouseEvent) => void

    constructor(props: SignatureCanvasProps) {
      super(props)
      this.onEnd = props.onEnd
      mockInstances.push(this)
    }

    componentDidUpdate(prevProps: SignatureCanvasProps) {
      if (prevProps.onEnd !== this.props.onEnd) {
        this.onEnd = this.props.onEnd
      }
    }

    isEmpty() {
      return this.empty
    }
    toDataURL(_type?: string) {
      return this.dataUrl
    }
    toData() {
      return this.data
    }
    clear() {
      this.clearCalls += 1
      this.empty = true
      this.data = []
    }

    render() {
      return React.createElement("canvas", {
        "data-testid": "mock-signature-canvas",
        ...(this.props.canvasProps ?? {}),
      })
    }
  }

  return { default: SignatureCanvasMock }
})

import { render, cleanup, fireEvent } from "@testing-library/react"
import { SignaturePad, type SignaturePadHandle } from "../signature-pad"

beforeEach(() => {
  mockInstances.length = 0
})
afterEach(() => {
  cleanup()
})

describe("SignaturePad", () => {
  it("renders a <canvas> element and the clear button", () => {
    const { getByTestId, getByRole } = render(<SignaturePad />)
    expect(getByTestId("signature-pad")).toBeDefined()
    expect(getByTestId("mock-signature-canvas")).toBeDefined()
    expect(
      getByRole("button", { name: /Signatur löschen/ }),
    ).toBeDefined()
  })

  it("applies the given width/height to canvasProps", () => {
    const { getByTestId } = render(<SignaturePad width={800} height={300} />)
    const canvas = getByTestId("mock-signature-canvas") as HTMLCanvasElement
    expect(canvas.getAttribute("width")).toBe("800")
    expect(canvas.getAttribute("height")).toBe("300")
  })

  it("exposes isEmpty() that returns true on a fresh mount", () => {
    const ref = createRef<SignaturePadHandle>()
    render(<SignaturePad ref={ref} />)
    expect(ref.current).not.toBeNull()
    expect(ref.current!.isEmpty()).toBe(true)
  })

  it("toPng() returns null when the canvas is empty", () => {
    const ref = createRef<SignaturePadHandle>()
    render(<SignaturePad ref={ref} />)
    expect(ref.current!.toPng()).toBeNull()
  })

  it("toPng() returns null when all strokes contain fewer than 3 points", () => {
    const ref = createRef<SignaturePadHandle>()
    render(<SignaturePad ref={ref} />)
    const canvas = mockInstances[0]!
    // Non-empty, but only a tiny stroke — counts as an accidental tap.
    canvas.empty = false
    canvas.data = [[{ x: 1, y: 1 }]] // Point[][] shape with 1 point
    expect(ref.current!.toPng()).toBeNull()
  })

  it("toPng() returns the data URL when a valid-length stroke exists", () => {
    const ref = createRef<SignaturePadHandle>()
    render(<SignaturePad ref={ref} />)
    const canvas = mockInstances[0]!
    canvas.empty = false
    canvas.data = [
      [
        { x: 1, y: 1 },
        { x: 5, y: 5 },
        { x: 9, y: 9 },
      ],
    ]
    canvas.dataUrl = "data:image/png;base64,FAKEPNG"
    expect(ref.current!.toPng()).toBe("data:image/png;base64,FAKEPNG")
  })

  it("clear() invokes the underlying canvas clear", () => {
    const ref = createRef<SignaturePadHandle>()
    render(<SignaturePad ref={ref} />)
    const canvas = mockInstances[0]!
    expect(canvas.clearCalls).toBe(0)
    ref.current!.clear()
    expect(canvas.clearCalls).toBe(1)
  })

  it("clicking the clear button calls clear on the canvas", () => {
    const { getByRole } = render(<SignaturePad />)
    const canvas = mockInstances[0]!
    expect(canvas.clearCalls).toBe(0)
    fireEvent.click(getByRole("button", { name: /Signatur löschen/ }))
    expect(canvas.clearCalls).toBe(1)
  })

  it("disables the clear button when the disabled prop is set", () => {
    const { getByRole } = render(<SignaturePad disabled />)
    const button = getByRole("button", { name: /Signatur löschen/ })
    expect((button as HTMLButtonElement).disabled).toBe(true)
  })

  it("fires onChange(false) after a stroke ends on a non-empty canvas", () => {
    const onChange = vi.fn()
    render(<SignaturePad onChange={onChange} />)
    const canvas = mockInstances[0]!
    // Simulate user drawing: canvas is now non-empty, then onEnd fires.
    canvas.empty = false
    canvas.onEnd?.(new MouseEvent("mouseup"))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it("fires onChange(true) after clear()", () => {
    const ref = createRef<SignaturePadHandle>()
    const onChange = vi.fn()
    render(<SignaturePad ref={ref} onChange={onChange} />)
    // Mark the canvas dirty first, then clear via the imperative handle.
    const canvas = mockInstances[0]!
    canvas.empty = false
    ref.current!.clear()
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it("fires onChange(true) after clicking the 'Signatur löschen' button", () => {
    const onChange = vi.fn()
    const { getByRole } = render(<SignaturePad onChange={onChange} />)
    const canvas = mockInstances[0]!
    canvas.empty = false
    fireEvent.click(getByRole("button", { name: /Signatur löschen/ }))
    expect(onChange).toHaveBeenCalledWith(true)
  })
})
