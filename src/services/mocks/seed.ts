// Deterministic seed for the MSW mock backend. Counts match README §11.
//
// All randomness flows through createPrng(seedNumber), so any given seed
// yields the same dataset every time — important for demos and tests.

import type {
  AttendanceRecord,
  Card,
  Class,
  Device,
  NotificationLog,
  NotificationSettings,
  School,
  Student,
  TapEvent,
  User,
} from '../../types/schemas'
import { createPrng, type Prng } from './random'

// School day uses Pakistan Standard Time (UTC+05:00, no DST).
const PKT_OFFSET = '+05:00'

const BOY_NAMES = [
  'Ahmad',
  'Hassan',
  'Ali',
  'Bilal',
  'Usman',
  'Hamza',
  'Saad',
  'Faisal',
  'Imran',
  'Asad',
  'Omer',
  'Hussain',
  'Junaid',
  'Tariq',
  'Adnan',
  'Salman',
  'Ibrahim',
  'Waleed',
  'Rizwan',
  'Kashif',
]
const GIRL_NAMES = [
  'Ayesha',
  'Fatima',
  'Zainab',
  'Sara',
  'Aisha',
  'Maryam',
  'Hira',
  'Anum',
  'Mehreen',
  'Rabia',
  'Iqra',
  'Saba',
  'Noor',
  'Mahira',
  'Saima',
  'Sadia',
  'Bushra',
  'Maleeha',
  'Amna',
  'Lubna',
]
const LAST_NAMES = [
  'Khan',
  'Ahmed',
  'Ali',
  'Hussain',
  'Iqbal',
  'Hashmi',
  'Malik',
  'Sheikh',
  'Aziz',
  'Qureshi',
  'Siddiqui',
  'Akhtar',
  'Raza',
  'Butt',
  'Chaudhry',
  'Mir',
]

function pad(n: number, width: number): string {
  return String(n).padStart(width, '0')
}

function ymd(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1, 2)}-${pad(d.getUTCDate(), 2)}`
}

function dateAtTime(ymdDate: string, hhmm: string): string {
  // ymdDate is "YYYY-MM-DD" interpreted in Asia/Karachi. We materialise
  // the wall-clock time and tag it with the +05:00 offset so the resulting
  // ISO string represents the correct instant in UTC.
  return `${ymdDate}T${hhmm}:00.000${PKT_OFFSET}`
}

function addMinutes(hhmm: string, minutes: number): string {
  const [hStr, mStr] = hhmm.split(':') as [string, string]
  const total = Number(hStr) * 60 + Number(mStr) + minutes
  return `${pad(Math.floor(total / 60), 2)}:${pad(total % 60, 2)}`
}

function rfidUid(prng: Prng): string {
  const chars = '0123456789ABCDEF'
  let out = ''
  for (let i = 0; i < 8; i += 1) out += chars[prng.nextInt(0, 15)]
  return out
}

function uniquePrefixedPhones(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${pad(i + 1, 5)}`)
}

export interface SeedStore {
  school: School
  classes: Class[]
  students: Student[]
  cards: Card[]
  devices: Device[]
  users: User[]
  attendance: AttendanceRecord[]
  tapEvents: TapEvent[]
  notifications: NotificationLog[]
  // PATCH /notifications/settings target — keyed by user.
  notificationSettings: Map<string, NotificationSettings>
}

export interface BuildSeedOptions {
  seedNumber?: number
  today?: Date
  timelineDays?: number
}

const DEFAULT_SETTINGS: NotificationSettings = {
  channels: { whatsapp: true, sms: true, in_app: true },
  events: {
    tap_in: true,
    tap_out: true,
    late: true,
    absent: true,
    manual_override: false,
    device_offline: false,
  },
}

export function buildSeed(options: BuildSeedOptions = {}): SeedStore {
  const seedNumber = options.seedNumber ?? 1
  const timelineDays = options.timelineDays ?? 30
  const today = options.today ?? new Date()
  const prng = createPrng(seedNumber)

  const school: School = {
    id: 'sch_1',
    name: 'Lahore Grammar Junior School',
    address: 'Gulberg III, Lahore',
    timezone: 'Asia/Karachi',
    startTime: '07:45',
    endTime: '13:30',
    lateThresholdMinutes: 15,
    absentThresholdMinutes: 30,
  }

  // Teachers + classes (one teacher per class).
  const teacherPhones = uniquePrefixedPhones('+9230012', 4)
  const teachers: User[] = teacherPhones.map((phone, i) => ({
    id: `usr_t_${i + 1}`,
    role: 'teacher',
    fullName: `${prng.pick(BOY_NAMES.concat(GIRL_NAMES))} ${prng.pick(LAST_NAMES)}`,
    phone,
    preferredLanguage: 'en',
    schoolId: school.id,
  }))

  const classes: Class[] = [
    { id: 'cls_1', name: 'Grade 3 — Section A', teacherId: teachers[0]!.id, schoolId: school.id },
    { id: 'cls_2', name: 'Grade 3 — Section B', teacherId: teachers[1]!.id, schoolId: school.id },
    { id: 'cls_3', name: 'Grade 4 — Section A', teacherId: teachers[2]!.id, schoolId: school.id },
    { id: 'cls_4', name: 'Grade 4 — Section B', teacherId: teachers[3]!.id, schoolId: school.id },
  ]

  // Admins.
  const adminPhones = uniquePrefixedPhones('+9230011', 3)
  const admins: User[] = adminPhones.map((phone, i) => ({
    id: `usr_a_${i + 1}`,
    role: 'admin',
    fullName: `${prng.pick(BOY_NAMES.concat(GIRL_NAMES))} ${prng.pick(LAST_NAMES)}`,
    phone,
    preferredLanguage: 'en',
    schoolId: school.id,
  }))

  // 60 students, 60 parents (1:1 for Phase 1 simplicity).
  const parentPhones = uniquePrefixedPhones('+9230010', 60)
  const parents: User[] = []
  const students: Student[] = []
  const cards: Card[] = []

  for (let i = 0; i < 60; i += 1) {
    const studentId = `std_${pad(i + 1, 3)}`
    const parentId = `usr_p_${pad(i + 1, 3)}`
    const cardId = `crd_${pad(i + 1, 3)}`

    const isBoy = prng.chance(0.5)
    const studentFirst = isBoy ? prng.pick(BOY_NAMES) : prng.pick(GIRL_NAMES)
    const family = prng.pick(LAST_NAMES)
    const parentFirst = prng.pick(BOY_NAMES.concat(GIRL_NAMES))

    const classIndex = i % classes.length
    students.push({
      id: studentId,
      fullName: `${studentFirst} ${family}`,
      rollNumber: `${classes[classIndex]!.id.toUpperCase().replace('CLS_', 'C')}-${pad(Math.floor(i / classes.length) + 1, 2)}`,
      classId: classes[classIndex]!.id,
      schoolId: school.id,
      guardianIds: [parentId],
      cardId,
      status: 'active',
    })

    parents.push({
      id: parentId,
      role: 'parent',
      fullName: `${parentFirst} ${family}`,
      phone: parentPhones[i]!,
      preferredLanguage: prng.chance(0.4) ? 'ur' : 'en',
      schoolId: school.id,
    })

    const issuedAt = dateAtTime(ymd(new Date(today.getTime() - 90 * 86400000)), '09:00')
    cards.push({
      id: cardId,
      rfidUid: rfidUid(prng),
      studentId,
      status: 'active',
      issuedAt,
      auditLog: [
        {
          at: issuedAt,
          byUserId: 'usr_a_1',
          action: 'issued',
          note: `Assigned to ${studentId}`,
        },
      ],
    })
  }

  // Two gate devices.
  const devices: Device[] = [
    {
      id: 'dev_main',
      schoolId: school.id,
      label: 'Main Gate',
      direction: 'both',
      status: 'online',
      lastHeartbeat: new Date(today.getTime() - prng.nextInt(5_000, 60_000)).toISOString(),
    },
    {
      id: 'dev_side',
      schoolId: school.id,
      label: 'Side Gate',
      direction: 'both',
      status: 'online',
      lastHeartbeat: new Date(today.getTime() - prng.nextInt(5_000, 60_000)).toISOString(),
    },
  ]

  // Attendance, tap events, notifications across the last `timelineDays`.
  const attendance: AttendanceRecord[] = []
  const tapEvents: TapEvent[] = []
  const notifications: NotificationLog[] = []

  for (let dayOffset = timelineDays - 1; dayOffset >= 0; dayOffset -= 1) {
    const day = new Date(today.getTime() - dayOffset * 86400000)
    // Skip Sundays — Pakistani schools are off on Sundays. Saturdays count.
    if (day.getUTCDay() === 0) continue
    const dateStr = ymd(day)

    for (const student of students) {
      const roll = prng.next()
      let status: AttendanceRecord['status']
      let inOffset: number | null = null
      let outOffset: number | null = null

      if (roll < 0.7) {
        status = 'present'
        inOffset = prng.nextInt(-15, 0) // 07:30–07:45
        outOffset = prng.nextInt(0, 15) // 13:30–13:45 (after end)
      } else if (roll < 0.85) {
        status = 'late'
        inOffset = prng.nextInt(15, 45) // 08:00–08:30
        outOffset = prng.nextInt(0, 15)
      } else if (roll < 0.92) {
        status = 'left_early'
        inOffset = prng.nextInt(-15, 0)
        outOffset = prng.nextInt(-150, -60) // 11:00–12:30
      } else {
        status = 'absent'
      }

      // For TODAY, dampen "absent" so the demo shows mostly active students.
      // School isn't necessarily over for today — leaving lastOut blank is realistic.
      const isToday = dayOffset === 0
      if (isToday && status === 'absent' && prng.chance(0.8)) {
        status = 'present'
        inOffset = prng.nextInt(-15, 0)
        outOffset = null
      }

      const firstInAt =
        inOffset === null ? undefined : dateAtTime(dateStr, addMinutes('07:45', inOffset))
      const lastOutAt =
        outOffset === null ? undefined : dateAtTime(dateStr, addMinutes('13:30', outOffset))

      attendance.push({
        id: `att_${student.id}_${dateStr}`,
        studentId: student.id,
        date: dateStr,
        ...(firstInAt ? { firstInAt } : {}),
        ...(lastOutAt ? { lastOutAt } : {}),
        status,
        isManual: false,
      })

      // Tap events: one for each non-null in/out.
      const card = cards.find((c) => c.id === student.cardId)
      if (!card) continue

      if (firstInAt) {
        const inEvent: TapEvent = {
          id: `tap_${student.id}_${dateStr}_in`,
          cardId: card.id,
          rfidUid: card.rfidUid,
          deviceId: 'dev_main',
          direction: 'in',
          occurredAt: firstInAt,
          source: 'device',
        }
        tapEvents.push(inEvent)
        // Notification for the parent — keep last 7 days only to bound size.
        if (dayOffset < 7) {
          notifications.push({
            id: `ntf_${inEvent.id}`,
            recipientUserId: student.guardianIds[0]!,
            channel: 'whatsapp',
            eventId: inEvent.id,
            status: 'delivered',
            sentAt: firstInAt,
            payload: {
              title: 'Arrived at school',
              body: `${student.fullName} tapped in at Main Gate.`,
            },
          })
        }
      }

      if (lastOutAt) {
        const outEvent: TapEvent = {
          id: `tap_${student.id}_${dateStr}_out`,
          cardId: card.id,
          rfidUid: card.rfidUid,
          deviceId: 'dev_main',
          direction: 'out',
          occurredAt: lastOutAt,
          source: 'device',
        }
        tapEvents.push(outEvent)
        if (dayOffset < 7) {
          notifications.push({
            id: `ntf_${outEvent.id}`,
            recipientUserId: student.guardianIds[0]!,
            channel: 'whatsapp',
            eventId: outEvent.id,
            status: 'delivered',
            sentAt: lastOutAt,
            payload: {
              title: 'Left school',
              body: `${student.fullName} tapped out at Main Gate.`,
            },
          })
        }
      }
    }
  }

  const users = [...admins, ...teachers, ...parents]
  const notificationSettings = new Map<string, NotificationSettings>()
  for (const u of users) notificationSettings.set(u.id, structuredClone(DEFAULT_SETTINGS))

  return {
    school,
    classes,
    students,
    cards,
    devices,
    users,
    attendance,
    tapEvents,
    notifications,
    notificationSettings,
  }
}

// Module-scoped mutable store shared by handlers. Tests can build their own
// fresh seed via buildSeed() and pass it into setupServer when needed.
export const seedStore: SeedStore = buildSeed()
