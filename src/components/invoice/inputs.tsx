import { useLayoutEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import { useFieldControl } from '../ui'

/** A textarea that grows with its text, so long descriptions never scroll or clip. */
export function AutoTextarea(props: ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    element.style.height = '0px'
    element.style.height = `${element.scrollHeight}px`
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

/**
 * Text typed into a number cell. `null` for an empty cell and NaN for something that is not a
 * number, so validation can say which. With `minorUnits`, "1500.5" becomes 150050 exactly; more
 * than two decimals gives a fraction of a minor unit, which validation reports.
 */
export function parseNumberInput(text: string, minorUnits = false): number | null {
  const trimmed = text.trim().replace(/,/g, '')
  if (trimmed === '') return null
  if (!/^-?\d*\.?\d*$/.test(trimmed) || !/\d/.test(trimmed)) return Number.NaN
  if (!minorUnits) return Number(trimmed)
  const negative = trimmed.startsWith('-')
  const [whole = '', fraction = ''] = trimmed.replace('-', '').split('.')
  if (fraction.length > 2) return Number(trimmed) * 100
  const minor = Number(whole || '0') * 100 + Number(fraction.padEnd(2, '0'))
  return negative ? -minor : minor
}

export function formatNumberInput(value: number | null, minorUnits = false): string {
  if (value === null || !Number.isFinite(value)) return ''
  return String(minorUnits ? value / 100 : value)
}

type NumberInputProps = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  value: number | null
  onValue: (value: number | null) => void
  /** The value is in minor units (paise) but typed in rupees. */
  minorUnits?: boolean
}

/** Keeps exactly what was typed (including mistakes) while reporting the parsed value. */
export function NumberInput({ value, onValue, minorUnits = false, ...rest }: NumberInputProps) {
  // Inside a <Field>, take its label, hint and error wiring like the other inputs.
  const props = useFieldControl(rest)
  const [text, setText] = useState(() => formatNumberInput(value, minorUnits))
  const [seen, setSeen] = useState(value)
  if (!Object.is(value, seen)) {
    // Changed from outside (a template, a reset): show the new value unless it is what is typed.
    setSeen(value)
    if (!Object.is(parseNumberInput(text, minorUnits), value)) setText(formatNumberInput(value, minorUnits))
  }
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(event) => {
        const next = parseNumberInput(event.target.value, minorUnits)
        setText(event.target.value)
        setSeen(next)
        onValue(next)
      }}
    />
  )
}
