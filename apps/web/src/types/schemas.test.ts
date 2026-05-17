import { describe, expect, it } from 'vitest'

import {
  attendanceRecordSchema,
  cardSchema,
  meResponseSchema,
  notificationSettingsSchema,
  schoolSchema,
  studentSchema,
  userSchema,
  verifyOtpRequestSchema,
} from '@fyntra/schemas'

describe('userSchema', () => {
  it('accepts a well-formed parent user', () => {
    const parsed = userSchema.parse({
      id: 'u_1',
      role: 'parent',
      fullName: 'Ayesha Khan',
      phone: '+923001234567',
      preferredLanguage: 'en',
      schoolId: 'sch_1',
    })
    expect(parsed.id).toBe('u_1')
  })

  it('rejects an unknown role', () => {
    expect(() =>
      userSchema.parse({
        id: 'u_1',
        role: 'principal',
        fullName: 'X',
        phone: '+923001234567',
        preferredLanguage: 'en',
        schoolId: 'sch_1',
      }),
    ).toThrow()
  })

  it('rejects an unsupported language', () => {
    expect(() =>
      userSchema.parse({
        id: 'u_1',
        role: 'parent',
        fullName: 'X',
        phone: '+923001234567',
        preferredLanguage: 'fr',
        schoolId: 'sch_1',
      }),
    ).toThrow()
  })
})

describe('schoolSchema', () => {
  it('requires the Asia/Karachi timezone literal', () => {
    expect(() =>
      schoolSchema.parse({
        id: 'sch_1',
        name: 'Test',
        address: 'Lahore',
        timezone: 'Asia/Dubai',
        startTime: '07:45',
        endTime: '13:30',
        lateThresholdMinutes: 15,
        absentThresholdMinutes: 30,
      }),
    ).toThrow()
  })

  it('requires absentThresholdMinutes to be non-negative', () => {
    expect(() =>
      schoolSchema.parse({
        id: 'sch_1',
        name: 'Test',
        address: 'Lahore',
        timezone: 'Asia/Karachi',
        startTime: '07:45',
        endTime: '13:30',
        lateThresholdMinutes: 15,
        absentThresholdMinutes: -5,
      }),
    ).toThrow()
  })
})

describe('studentSchema', () => {
  it('makes cardId and photoUrl optional', () => {
    const parsed = studentSchema.parse({
      id: 'std_1',
      fullName: 'Ahmad Khan',
      rollNumber: 'C1-01',
      classId: 'cls_1',
      schoolId: 'sch_1',
      guardianIds: ['usr_p_1'],
      status: 'active',
    })
    expect(parsed.cardId).toBeUndefined()
  })
})

describe('cardSchema', () => {
  it('accepts the documented status values', () => {
    for (const status of ['active', 'lost', 'replaced', 'deactivated'] as const) {
      expect(() =>
        cardSchema.parse({
          id: 'c_1',
          rfidUid: 'AABBCCDD',
          status,
          issuedAt: '2026-01-01T00:00:00.000Z',
        }),
      ).not.toThrow()
    }
  })
})

describe('attendanceRecordSchema', () => {
  it('accepts a present record', () => {
    const parsed = attendanceRecordSchema.parse({
      id: 'att_1',
      studentId: 'std_1',
      date: '2026-05-10',
      firstInAt: '2026-05-10T07:42:00.000+05:00',
      lastOutAt: '2026-05-10T13:32:00.000+05:00',
      status: 'present',
      isManual: false,
    })
    expect(parsed.status).toBe('present')
  })
})

describe('notificationSettingsSchema', () => {
  it('requires every channel and event flag', () => {
    expect(() =>
      notificationSettingsSchema.parse({
        channels: { whatsapp: true, sms: true },
        events: { tap_in: true },
      }),
    ).toThrow()
  })
})

describe('verifyOtpRequestSchema', () => {
  it('requires a 4-digit OTP', () => {
    expect(() => verifyOtpRequestSchema.parse({ phone: '+923001234567', otp: '12345' })).toThrow()
    expect(() => verifyOtpRequestSchema.parse({ phone: '+923001234567', otp: '12a4' })).toThrow()
    expect(verifyOtpRequestSchema.parse({ phone: '+923001234567', otp: '1234' }).otp).toBe('1234')
  })
})

const sampleSchool = {
  id: 'sch_1',
  name: 'Test School',
  address: 'Lahore',
  timezone: 'Asia/Karachi' as const,
  startTime: '07:45',
  endTime: '13:30',
  lateThresholdMinutes: 15,
  absentThresholdMinutes: 30,
}

describe('meResponseSchema', () => {
  it('accepts admin responses without children', () => {
    const parsed = meResponseSchema.parse({
      user: {
        id: 'u_a_1',
        role: 'admin',
        fullName: 'A',
        phone: '+92300',
        preferredLanguage: 'en',
        schoolId: 'sch_1',
      },
      school: sampleSchool,
    })
    expect(parsed.children).toBeUndefined()
    expect(parsed.school.id).toBe('sch_1')
  })

  it('accepts parent responses with a children array', () => {
    const parsed = meResponseSchema.parse({
      user: {
        id: 'u_p_1',
        role: 'parent',
        fullName: 'P',
        phone: '+92300',
        preferredLanguage: 'en',
        schoolId: 'sch_1',
      },
      school: sampleSchool,
      children: [
        {
          id: 'std_1',
          fullName: 'C',
          rollNumber: 'C1-01',
          classId: 'cls_1',
          schoolId: 'sch_1',
          guardianIds: ['u_p_1'],
          status: 'active',
        },
      ],
    })
    expect(parsed.children).toHaveLength(1)
  })

  it('rejects responses missing the school', () => {
    expect(() =>
      meResponseSchema.parse({
        user: {
          id: 'u_a_1',
          role: 'admin',
          fullName: 'A',
          phone: '+92300',
          preferredLanguage: 'en',
          schoolId: 'sch_1',
        },
      }),
    ).toThrow()
  })
})
