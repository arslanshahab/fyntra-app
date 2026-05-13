import { describe, it, expect } from 'vitest'
import { AppError, NotFoundError, UnauthorizedError, ConflictError } from './errors.js'

describe('errors', () => {
  it('AppError carries statusCode and code', () => {
    const e = new AppError('boom', { statusCode: 418, code: 'IM_A_TEAPOT' })
    expect(e.statusCode).toBe(418)
    expect(e.code).toBe('IM_A_TEAPOT')
    expect(e.message).toBe('boom')
  })

  it('NotFoundError defaults to 404', () => {
    const e = new NotFoundError('thing')
    expect(e.statusCode).toBe(404)
  })

  it('UnauthorizedError defaults to 401', () => {
    expect(new UnauthorizedError('nope').statusCode).toBe(401)
  })

  it('ConflictError defaults to 409', () => {
    expect(new ConflictError('dup').statusCode).toBe(409)
  })
})
