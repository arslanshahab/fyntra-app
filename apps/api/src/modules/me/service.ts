import { NotFoundError } from '../../lib/errors.js'
import type { TenantContext } from '../../types/tenant-context.js'
import { meRepo } from './repository.js'

export async function getMe(ctx: TenantContext) {
  const [user, school] = await Promise.all([meRepo.user(ctx), meRepo.school(ctx)])
  if (!user || !school) throw new NotFoundError('Account not found')
  const out: {
    user: typeof user
    school: typeof school
    children?: Awaited<ReturnType<typeof meRepo.children>>
    assignedClass?: Awaited<ReturnType<typeof meRepo.assignedClass>>
  } = { user, school }
  if (ctx.role === 'parent') out.children = await meRepo.children(ctx)
  if (ctx.role === 'teacher') {
    const cls = await meRepo.assignedClass(ctx)
    if (cls) out.assignedClass = cls
  }
  return out
}
