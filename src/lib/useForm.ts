import { useState } from 'react'

/** Form state that knows whether it differs from where it started, for the unsaved-changes warning. */
export function useForm<T extends object>(initial: T) {
  const [start, setStart] = useState(initial)
  const [values, setValues] = useState(initial)
  const dirty = JSON.stringify(values) !== JSON.stringify(start)

  function set<K extends keyof T>(key: K, value: T[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  /** Treat `next` as the new starting point, e.g. once data the form needs has loaded. */
  function reset(next: T) {
    setStart(next)
    setValues(next)
  }

  return { values, set, dirty, reset }
}
