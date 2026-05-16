import { AlertTriangle, ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Icon } from '../../components/atoms/Icon'
import { Spinner } from '../../components/atoms/Spinner'
import { Switch } from '../../components/atoms/Switch'
import { StatusCard } from '../../components/molecules/StatusCard'
import {
  useNotificationSettingsQuery,
  useUpdateNotificationSettingsMutation,
} from '../../features/notifications/queries'
import type { NotificationSettings } from '@fyntra/schemas'

// Per README §6: parents do NOT toggle device_offline — it's an admin/teacher
// concern. The PATCH body must still carry all event flags, so we preserve
// whatever value the server returned for device_offline.
type ParentChannel = keyof NotificationSettings['channels']
type ParentEvent = Exclude<keyof NotificationSettings['events'], 'device_offline'>

const PARENT_CHANNELS: ParentChannel[] = ['whatsapp', 'sms', 'in_app']
const PARENT_EVENTS: ParentEvent[] = ['tap_in', 'tap_out', 'late', 'absent', 'manual_override']

export function ParentSettingsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const settingsQuery = useNotificationSettingsQuery()
  const update = useUpdateNotificationSettingsMutation()

  const settings = settingsQuery.data
  const activeLocale = i18n.language.startsWith('ur') ? 'ur' : 'en'

  const onChannel = (key: ParentChannel, value: boolean) => {
    if (!settings) return
    update.mutate({
      ...settings,
      channels: { ...settings.channels, [key]: value },
    })
  }

  const onEvent = (key: ParentEvent, value: boolean) => {
    if (!settings) return
    update.mutate({
      ...settings,
      events: { ...settings.events, [key]: value },
    })
  }

  return (
    <main className="min-h-dvh bg-stone-50">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => navigate('/parent')}
            aria-label={t('parent.settings.back')}
            className="rounded-md p-2 text-stone-600 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Icon icon={ChevronLeft} size="md" className="rtl:rotate-180" />
          </button>
          <p className="truncate font-display text-base font-semibold tracking-tight text-stone-900">
            {t('parent.settings.title')}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-4 px-5 pb-10 pt-6">
        {settingsQuery.isLoading ? (
          <div
            role="status"
            aria-label={t('common.loading')}
            className="flex items-center justify-center rounded-2xl bg-white p-12 shadow-elev-1 ring-1 ring-stone-200"
          >
            <Spinner />
          </div>
        ) : settingsQuery.isError || !settings ? (
          <StatusCard
            tone="alarm"
            icon={AlertTriangle}
            body={t('parent.settings.loadError')}
            action={{
              label: t('common.retry'),
              onClick: () => void settingsQuery.refetch(),
            }}
          />
        ) : (
          <>
            {update.isError ? (
              <p
                role="alert"
                className="rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm ring-1 ring-status-alarm/20"
              >
                {t('parent.settings.saveError')}
              </p>
            ) : null}

            <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
              <h2 className="font-display text-base font-semibold text-stone-900">
                {t('parent.settings.channelsHeading')}
              </h2>
              <p className="mt-0.5 text-xs text-stone-500">{t('parent.settings.channelsHint')}</p>
              <ul className="mt-4 space-y-4">
                {PARENT_CHANNELS.map((channel) => {
                  const id = `channel-${channel}`
                  return (
                    <li key={channel} className="flex items-start justify-between gap-3">
                      <label htmlFor={id} className="min-w-0 cursor-pointer">
                        <p className="text-sm font-medium text-stone-900">
                          {t(`parent.settings.channel.${channel}`)}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {t(`parent.settings.channel.${channel}Hint`)}
                        </p>
                      </label>
                      <Switch
                        id={id}
                        checked={settings.channels[channel]}
                        onChange={(v) => onChannel(channel, v)}
                        ariaLabel={t(`parent.settings.channel.${channel}`)}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
              <h2 className="font-display text-base font-semibold text-stone-900">
                {t('parent.settings.eventsHeading')}
              </h2>
              <p className="mt-0.5 text-xs text-stone-500">{t('parent.settings.eventsHint')}</p>
              <ul className="mt-4 space-y-4">
                {PARENT_EVENTS.map((event) => {
                  const id = `event-${event}`
                  return (
                    <li key={event} className="flex items-start justify-between gap-3">
                      <label htmlFor={id} className="min-w-0 cursor-pointer">
                        <p className="text-sm font-medium text-stone-900">
                          {t(`parent.settings.event.${event}`)}
                        </p>
                        <p className="mt-0.5 text-xs text-stone-500">
                          {t(`parent.settings.event.${event}Hint`)}
                        </p>
                      </label>
                      <Switch
                        id={id}
                        checked={settings.events[event]}
                        onChange={(v) => onEvent(event, v)}
                        ariaLabel={t(`parent.settings.event.${event}`)}
                      />
                    </li>
                  )
                })}
              </ul>
            </section>

            <section className="rounded-2xl bg-white p-5 shadow-elev-1 ring-1 ring-stone-200">
              <h2 className="font-display text-base font-semibold text-stone-900">
                {t('parent.settings.languageHeading')}
              </h2>
              <p className="mt-0.5 text-xs text-stone-500">{t('parent.settings.languageHint')}</p>
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-stone-100 p-1">
                {(['en', 'ur'] as const).map((lng) => (
                  <button
                    key={lng}
                    type="button"
                    aria-pressed={activeLocale === lng}
                    onClick={() => void i18n.changeLanguage(lng)}
                    className={
                      activeLocale === lng
                        ? 'rounded-md bg-white px-3 py-1.5 text-sm font-medium text-stone-900 shadow-elev-1'
                        : 'rounded-md px-3 py-1.5 text-sm font-medium text-stone-600 transition-colors hover:text-stone-900'
                    }
                  >
                    {t(`parent.settings.language.${lng}`)}
                  </button>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  )
}
