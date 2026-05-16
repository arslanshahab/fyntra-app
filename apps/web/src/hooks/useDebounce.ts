import { useEffect, useState } from 'react'

// Returns `value` after `ms` of stable input. Used to debounce search
// inputs and other rapidly-changing values that drive Query keys.
export function useDebounce<T>(value: T, ms = 250): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])

  return debounced
}
