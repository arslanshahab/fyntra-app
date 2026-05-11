import { describe, expect, it } from 'vitest'

import {
  attendanceRecordSchema,
  cardSchema,
  classSchema,
  deviceSchema,
  schoolSchema,
  studentSchema,
  tapEventSchema,
  userSchema,
} from '../../types/schemas'
import { buildSeed } from './seed'

describe('buildSeed', () => {
  const seed = buildSeed({ seedNumber: 42, today: new Date('2026-05-10T12:00:00.000+05:00') })

  it('matches the documented Phase 1 counts (README §11)', () => {
    expect(seed.classes).toHaveLength(4)
    expect(seed.students).toHaveLength(60)
    expect(seed.devices).toHaveLength(2)
    expect(seed.cards).toHaveLength(60)
    expect(seed.users.filter((u) => u.role === 'admin')).toHaveLength(3)
    expect(seed.users.filter((u) => u.role === 'teacher')).toHaveLength(4)
    expect(seed.users.filter((u) => u.role === 'parent')).toHaveLength(60)
  })

  it('is deterministic across builds with the same seed', () => {
    const a = buildSeed({ seedNumber: 7, today: new Date('2026-05-10T12:00:00.000+05:00') })
    const b = buildSeed({ seedNumber: 7, today: new Date('2026-05-10T12:00:00.000+05:00') })
    expect(a.students.map((s) => s.fullName)).toEqual(b.students.map((s) => s.fullName))
    expect(a.cards.map((c) => c.rfidUid)).toEqual(b.cards.map((c) => c.rfidUid))
  })

  it('produces records that validate against the Zod schemas', () => {
    expect(() => schoolSchema.parse(seed.school)).not.toThrow()
    for (const c of seed.classes) classSchema.parse(c)
    for (const s of seed.students) studentSchema.parse(s)
    for (const c of seed.cards) cardSchema.parse(c)
    for (const d of seed.devices) deviceSchema.parse(d)
    for (const u of seed.users) userSchema.parse(u)
    // Sample-check large arrays.
    for (const a of seed.attendance.slice(0, 50)) attendanceRecordSchema.parse(a)
    for (const t of seed.tapEvents.slice(0, 50)) tapEventSchema.parse(t)
  })

  it('every student has a guardian who exists in users', () => {
    const userIds = new Set(seed.users.map((u) => u.id))
    for (const student of seed.students) {
      for (const gid of student.guardianIds) {
        expect(userIds.has(gid)).toBe(true)
      }
    }
  })

  it('cards are linked to existing students', () => {
    const studentIds = new Set(seed.students.map((s) => s.id))
    for (const card of seed.cards) {
      if (card.studentId) expect(studentIds.has(card.studentId)).toBe(true)
    }
  })

  it('default notification settings are populated for every user', () => {
    for (const u of seed.users) {
      expect(seed.notificationSettings.has(u.id)).toBe(true)
    }
  })
})
