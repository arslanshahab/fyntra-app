import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { Icon } from '../../components/atoms/Icon'
import { Spinner } from '../../components/atoms/Spinner'
import { Switch } from '../../components/atoms/Switch'
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
    <main className="min-h-dvh bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => navigate('/parent')}
            aria-label={t('parent.settings.back')}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <Icon icon={ChevronLeft} size="md" className="rtl:rotate-180" />
          </button>
          <p className="truncate text-sm font-semibold text-slate-900">
            {t('parent.settings.title')}
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-md space-y-4 p-5">
        {settingsQuery.isLoading ? (
          <div
            role="status"
            aria-label={t('common.loading')}
            className="flex items-center justify-center rounded-2xl bg-white p-12 shadow-sm ring-1 ring-slate-200"
          >
            <Spinner />
          </div>
        ) : settingsQuery.isError || !settings ? (
          <p role="alert" className="rounded-2xl bg-status-alarm/10 p-5 text-sm text-status-alarm">
            {t('parent.settings.loadError')}
          </p>
        ) : (
          <>
            {update.isError ? (
              <p
                role="alert"
                className="rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm"
              >
                {t('parent.settings.saveError')}
              </p>
            ) : null}

            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                {t('parent.settings.channelsHeading')}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">{t('parent.settings.channelsHint')}</p>
              <ul className="mt-4 space-y-4">
                {PARENT_CHANNELS.map((channel) => {
                  const id = `channel-${channel}`
                  return (
                    <li key={channel} className="flex items-start justify-between gap-3">
                      <label htmlFor={id} className="min-w-0 cursor-pointer">
                        <p className="text-sm font-medium text-slate-900">
                          {t(`parent.settings.channel.${channel}`)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
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

            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                {t('parent.settings.eventsHeading')}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">{t('parent.settings.eventsHint')}</p>
              <ul className="mt-4 space-y-4">
                {PARENT_EVENTS.map((event) => {
                  const id = `event-${event}`
                  return (
                    <li key={event} className="flex items-start justify-between gap-3">
                      <label htmlFor={id} className="min-w-0 cursor-pointer">
                        <p className="text-sm font-medium text-slate-900">
                          {t(`parent.settings.event.${event}`)}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
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

            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <h2 className="text-sm font-semibold text-slate-900">
                {t('parent.settings.languageHeading')}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">{t('parent.settings.languageHint')}</p>
              <div className="mt-4 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1">
                {(['en', 'ur'] as const).map((lng) => (
                  <button
                    key={lng}
                    type="button"
                    aria-pressed={activeLocale === lng}
                    onClick={() => void i18n.changeLanguage(lng)}
                    className={
                      activeLocale === lng
                        ? 'rounded-md bg-white px-3 py-1.5 text-sm font-medium text-slate-900 shadow-sm'
                        : 'rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:text-slate-900'
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
