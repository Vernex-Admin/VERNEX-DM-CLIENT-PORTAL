import { useEffect, useRef, useState } from 'react'
import { Button } from './ui'

type Props = { onSave: (signature: Blob) => void; disabled?: boolean; label?: string }

export function SignaturePad({ onSave, disabled = false, label = 'Draw your signature' }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (canvas && context) {
      context.fillStyle = '#ffffff'
      context.fillRect(0, 0, canvas.width, canvas.height)
    }
  }, [])

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  function start(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    const canvas = canvasRef.current
    const location = point(event)
    const context = canvas?.getContext('2d')
    if (!canvas || !location || !context) return
    canvas.setPointerCapture(event.pointerId)
    drawing.current = true
    context.beginPath()
    context.moveTo(location.x, location.y)
    context.lineWidth = 3
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.strokeStyle = '#0b2454'
    setHasInk(true)
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const location = point(event)
    const context = canvasRef.current?.getContext('2d')
    if (!location || !context) return
    context.lineTo(location.x, location.y)
    context.stroke()
  }

  function stop() { drawing.current = false }

  function clear() {
    const canvas = canvasRef.current
    const context = canvas?.getContext('2d')
    if (!canvas || !context) return
    context.clearRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  function save() {
    const canvas = canvasRef.current
    if (!canvas || !hasInk || disabled) return
    canvas.toBlob((signature) => { if (signature) onSave(signature) }, 'image/jpeg', 0.92)
  }

  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      <canvas
        ref={canvasRef}
        width={900}
        height={260}
        aria-label={label}
        className="h-36 w-full touch-none rounded-card border border-rule bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="secondary" size="sm" disabled={!hasInk || disabled} onClick={clear}>Clear</Button>
        <Button type="button" variant="primary" size="sm" disabled={!hasInk || disabled} onClick={save}>Use signature</Button>
      </div>
    </section>
  )
}
