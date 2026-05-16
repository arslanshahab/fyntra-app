import { db } from '../../src/db/client.js'
import {
  schools,
  classes,
} from '../../src/db/schema/schools.js'
import { users, otpCodes } from '../../src/db/schema/auth.js'
import { students, studentGuardians } from '../../src/db/schema/students.js'
import { cards, cardAuditEntries } from '../../src/db/schema/cards.js'
import { devices, deviceTokens } from '../../src/db/schema/devices.js'
import { tapEvents, attendanceRecords } from '../../src/db/schema/attendance.js'
import { notificationLogs, notificationSettings } from '../../src/db/schema/notifications.js'

export async function truncateAll() {
  // children first, then parents
  await db.delete(notificationLogs)
  await db.delete(notificationSettings)
  await db.delete(attendanceRecords)
  await db.delete(tapEvents)
  await db.delete(cardAuditEntries)
  await db.delete(cards)
  await db.delete(deviceTokens)
  await db.delete(devices)
  await db.delete(studentGuardians)
  await db.delete(students)
  await db.delete(otpCodes)
  await db.delete(users)
  await db.delete(classes)
  await db.delete(schools)
}
