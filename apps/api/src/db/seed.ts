import 'dotenv/config'
import { db, pool } from './client.js'
import { schools, classes } from './schema/schools.js'
import { users, type UserRow } from './schema/auth.js'
import { students, studentGuardians } from './schema/students.js'
import { cards } from './schema/cards.js'
import { devices, deviceTokens } from './schema/devices.js'
import { notificationSettings } from './schema/notifications.js'
import { newId } from '../lib/ids.js'
import { hashToken, newDeviceToken } from '../lib/tokens.js'

async function seed() {
  // --- School
  const schoolId = newId()
  await db.insert(schools).values({
    id: schoolId,
    name: 'Beaconhouse Model School — Lahore',
    address: '123 Garden Town, Lahore',
    timezone: 'Asia/Karachi',
    startTime: '07:45',
    endTime: '13:30',
    lateThresholdMinutes: 10,
    absentThresholdMinutes: 30,
  })

  // --- Teachers (4), Admins (3), Parents (60)
  const teacherIds = Array.from({ length: 4 }, () => newId())
  const adminIds = Array.from({ length: 3 }, () => newId())
  const parentIds = Array.from({ length: 60 }, () => newId())

  const teacherRows = teacherIds.map((id, i) => ({
    id,
    schoolId,
    role: 'teacher' as const,
    fullName: `Teacher ${String(i + 1).padStart(2, '0')}`,
    phone: `+9230012000${String(i + 1).padStart(2, '0')}`,
    preferredLanguage: 'en' as const,
  }))
  const adminRows = adminIds.map((id, i) => ({
    id,
    schoolId,
    role: 'admin' as const,
    fullName: `Admin ${String(i + 1).padStart(2, '0')}`,
    phone: `+9230011000${String(i + 1).padStart(2, '0')}`,
    preferredLanguage: 'en' as const,
  }))
  const parentRows: Array<typeof users.$inferInsert> = parentIds.map((id, i) => ({
    id,
    schoolId,
    role: 'parent' as const,
    fullName: `Parent ${String(i + 1).padStart(2, '0')}`,
    phone: `+9230010000${String(i + 1).padStart(2, '0')}`,
    preferredLanguage: 'en' as const,
  }))
  await db.insert(users).values([...teacherRows, ...adminRows, ...parentRows])

  // --- Classes (4)
  const classIds = teacherIds.map((_t) => newId())
  await db.insert(classes).values(
    classIds.map((id, i) => ({
      id,
      schoolId,
      name: `Grade ${i + 1} — Section A`,
      teacherId: teacherIds[i]!,
    })),
  )

  // --- Students (60, 15 per class)
  const studentIds = Array.from({ length: 60 }, () => newId())
  const studentRows = studentIds.map((id, i) => ({
    id,
    schoolId,
    classId: classIds[Math.floor(i / 15)]!,
    fullName: `Student ${String(i + 1).padStart(2, '0')}`,
    rollNumber: String(i + 1).padStart(3, '0'),
    status: 'active' as const,
  }))
  await db.insert(students).values(studentRows)

  // 1:1 student → parent (60 of each)
  await db.insert(studentGuardians).values(
    studentIds.map((studentId, i) => ({
      studentId,
      userId: parentIds[i]!,
      schoolId,
      relationship: 'guardian' as const,
    })),
  )

  // --- Cards (one active per student)
  const cardIds = studentIds.map(() => newId())
  await db.insert(cards).values(
    cardIds.map((id, i) => ({
      id,
      schoolId,
      rfidUid: `SEED${String(i + 1).padStart(8, '0')}`,
      studentId: studentIds[i]!,
      status: 'active' as const,
    })),
  )

  // --- Devices (2) with plaintext tokens printed once
  const deviceA = newId()
  const deviceB = newId()
  await db.insert(devices).values([
    { id: deviceA, schoolId, label: 'Main Gate', direction: 'both', status: 'offline' },
    { id: deviceB, schoolId, label: 'Side Gate', direction: 'both', status: 'offline' },
  ])
  const plainA = newDeviceToken()
  const plainB = newDeviceToken()
  await db.insert(deviceTokens).values([
    { id: newId(), deviceId: deviceA, schoolId, tokenHash: hashToken(plainA), label: 'Main Gate dev token' },
    { id: newId(), deviceId: deviceB, schoolId, tokenHash: hashToken(plainB), label: 'Side Gate dev token' },
  ])

  // --- Notification settings (default per role) for every user
  const allUserRows: UserRow[] = [...teacherRows, ...adminRows, ...parentRows].map((r) => ({
    ...r,
    email: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  })) as UserRow[]
  await db.insert(notificationSettings).values(
    allUserRows.map((u) => ({
      userId: u.id,
      schoolId,
      whatsapp: true,
      sms: false,
      inApp: true,
      eventTapIn: true,
      eventTapOut: true,
      eventLate: true,
      eventAbsent: true,
      eventManualOverride: true,
      eventDeviceOffline: u.role !== 'parent',
    })),
  )

  console.log('seed complete')
  console.log('')
  console.log('--- Device tokens (save these; not shown again) ---')
  console.log(`Main Gate (${deviceA}): ${plainA}`)
  console.log(`Side Gate (${deviceB}): ${plainB}`)
  console.log('')
}

seed()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => pool.end())
