import { describe, it, expect } from 'vitest'
import { Broker } from './realtime.js'

describe('Broker', () => {
  it('delivers messages to subscribers of a channel', () => {
    const b = new Broker()
    const received: unknown[] = []
    const unsub = b.subscribe('x', (msg) => received.push(msg))
    b.publish('x', { a: 1 })
    b.publish('y', { a: 2 })
    expect(received).toEqual([{ a: 1 }])
    unsub()
    b.publish('x', { a: 3 })
    expect(received).toEqual([{ a: 1 }])
  })
})
