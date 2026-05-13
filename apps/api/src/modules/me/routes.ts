import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import { getMe } from './service.js'

export const meRoutes: FastifyPluginAsync = async (app) => {
  app.get('/me', { preHandler: requireAuth }, async (req) => {
    const ctx = req.tenantContext!
    const result = await getMe(ctx)
    return {
      user: {
        id: result.user.id,
        role: result.user.role,
        fullName: result.user.fullName,
        phone: result.user.phone,
        email: result.user.email ?? undefined,
        preferredLanguage: result.user.preferredLanguage,
        schoolId: result.user.schoolId,
      },
      school: {
        id: result.school.id,
        name: result.school.name,
        address: result.school.address,
        timezone: 'Asia/Karachi' as const,
        startTime: result.school.startTime,
        endTime: result.school.endTime,
        lateThresholdMinutes: result.school.lateThresholdMinutes,
        absentThresholdMinutes: result.school.absentThresholdMinutes,
      },
      children: result.children?.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        rollNumber: c.rollNumber,
        classId: c.classId,
        schoolId: c.schoolId,
        guardianIds: [],
        photoUrl: c.photoUrl ?? undefined,
        status: c.status,
      })),
      assignedClass: result.assignedClass
        ? {
            id: result.assignedClass.id,
            name: result.assignedClass.name,
            teacherId: result.assignedClass.teacherId,
            schoolId: result.assignedClass.schoolId,
          }
        : undefined,
    }
  })
}
