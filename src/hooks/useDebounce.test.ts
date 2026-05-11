import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useDebounce } from './useDebounce'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useDebounce', () => {
  it('returns the initial value synchronously', () => {
    const { result } = renderHook(() => useDebounce('a', 200))
    expect(result.current).toBe('a')
  })

  it('updates after the debounce window elapses', () => {
    const { result, rerender } = renderHook(({ v }: { v: string }) => useDebounce(v, 200), {
      initialProps: { v: 'a' },
    })
    rerender({ v: 'b' })
    expect(result.current).toBe('a')
    act(() => {
      vi.advanceTimersByTime(199)
    })
    expect(result.current).toBe('a')
    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('b')
  })

  it('resets the timer on rapid successive changes', () => {
    const { result, rerender } = renderHook(({ v }: { v: string }) => useDebounce(v, 200), {
      initialProps: { v: 'a' },
    })
    rerender({ v: 'b' })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    rerender({ v: 'c' })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current).toBe('a') // still 'a' — 'c' has only had 150ms
    act(() => {
      vi.advanceTimersByTime(50)
    })
    expect(result.current).toBe('c')
  })
})
