import { useTranslation } from 'react-i18next'

import { StatBlock, StatBlockSkeleton } from '../molecules/StatBlock'
import type { DashboardStats } from '../../utils/dashboardStats'

interface DashboardStatRowProps {
  stats: DashboardStats
}

export function DashboardStatRow({ stats }: DashboardStatRowProps) {
  const { t } = useTranslation()
  const hint = t('admin.stats.ofTotal', { total: stats.total })
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatBlock
        label={t('admin.stats.present')}
        value={stats.present}
        tone="present"
        hint={hint}
      />
      <StatBlock label={t('admin.stats.late')} value={stats.late} tone="late" hint={hint} />
      <StatBlock label={t('admin.stats.absent')} value={stats.absent} tone="absent" hint={hint} />
      <StatBlock
        label={t('admin.stats.noTapYet')}
        value={stats.noTapYet}
        tone="notyet"
        hint={hint}
      />
    </div>
  )
}

export function DashboardStatRowSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatBlockSkeleton />
      <StatBlockSkeleton />
      <StatBlockSkeleton />
      <StatBlockSkeleton />
    </div>
  )
}
