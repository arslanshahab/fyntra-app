import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Languages } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '../../components/atoms/Button'
import { Input } from '../../components/atoms/Input'
import { useRequestOtpMutation, useVerifyOtpMutation } from '../../features/auth/mutations'
import { ApiError } from '../../services/api/client'
import { useAuthStore } from '../../stores/auth'

const phoneSchema = z.object({
  phone: z.string().regex(/^\+\d{8,15}$/, 'invalid'),
})

const otpSchema = z.object({
  otp: z.string().regex(/^\d{4}$/, 'invalid'),
})

type PhoneForm = z.infer<typeof phoneSchema>
type OtpForm = z.infer<typeof otpSchema>

export function LoginPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isUrdu = i18n.language.startsWith('ur')

  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState<string>('')
  const [topError, setTopError] = useState<string | null>(null)

  const requestOtp = useRequestOtpMutation()
  const verifyOtp = useVerifyOtpMutation()

  const phoneForm = useForm<PhoneForm>({
    resolver: zodResolver(phoneSchema),
    defaultValues: { phone: '' },
  })

  const otpForm = useForm<OtpForm>({
    resolver: zodResolver(otpSchema),
    defaultValues: { otp: '' },
  })

  useEffect(() => {
    if (step === 'phone') otpForm.reset({ otp: '' })
  }, [step, otpForm])

  const onSubmitPhone = phoneForm.handleSubmit(async (data) => {
    setTopError(null)
    try {
      await requestOtp.mutateAsync(data.phone)
      setPhone(data.phone)
      setStep('otp')
    } catch {
      setTopError(t('login.errors.generic'))
    }
  })

  const onSubmitOtp = otpForm.handleSubmit(async (data) => {
    setTopError(null)
    try {
      const result = await verifyOtp.mutateAsync({ phone, otp: data.otp })
      setAuth({ token: result.token, user: result.user })
      // Intentionally do NOT change i18n.language based on user.preferredLanguage —
      // the active session locale is the user's choice via the toggle, not a
      // server-driven override.
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setTopError(t('login.errors.unknownPhone'))
        setStep('phone')
      } else {
        setTopError(t('login.errors.generic'))
      }
    }
  })

  const toggleLanguage = () => {
    void i18n.changeLanguage(isUrdu ? 'en' : 'ur')
  }

  const heading =
    step === 'phone' ? t('login.phoneStep.heading') : t('login.otpStep.heading')
  const body =
    step === 'phone' ? t('login.phoneStep.body') : t('login.otpStep.body', { phone })

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-b from-brand-50/60 via-stone-50 to-stone-50 px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <div
            aria-hidden="true"
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-white shadow-elev-1"
          >
            <span className="font-display text-xl font-bold leading-none">F</span>
          </div>
          <div>
            <p className="font-display text-xl font-semibold tracking-tight text-stone-900">
              {t('app.name')}
            </p>
            <p className="text-xs text-stone-500">{t('app.tagline')}</p>
          </div>
        </div>

        <div className="rounded-hero bg-white p-7 shadow-elev-2 ring-1 ring-stone-200">
          <h1 className="font-display text-display-lg font-semibold tracking-tight text-stone-900">
            {heading}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-600">{body}</p>

          {topError ? (
            <div
              role="alert"
              className="mt-5 rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm ring-1 ring-status-alarm/20"
            >
              {topError}
            </div>
          ) : null}

          {step === 'phone' ? (
            <form noValidate className="mt-6 space-y-4" onSubmit={onSubmitPhone}>
              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-stone-700">
                  {t('login.phoneStep.phoneLabel')}
                </label>
                <Input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={t('login.phoneStep.phonePlaceholder')}
                  hasError={!!phoneForm.formState.errors.phone}
                  aria-describedby="phone-error"
                  className="mt-1.5"
                  {...phoneForm.register('phone')}
                />
                {phoneForm.formState.errors.phone ? (
                  <p id="phone-error" className="mt-1.5 text-xs text-status-alarm">
                    {t('login.phoneStep.invalidPhone')}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                isLoading={requestOtp.isPending}
                disabled={requestOtp.isPending}
              >
                {t('login.phoneStep.submit')}
              </Button>
            </form>
          ) : (
            <form noValidate className="mt-6 space-y-4" onSubmit={onSubmitOtp}>
              <div>
                <label htmlFor="otp" className="block text-sm font-medium text-stone-700">
                  {t('login.otpStep.otpLabel')}
                </label>
                <Input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={4}
                  placeholder="••••"
                  hasError={!!otpForm.formState.errors.otp}
                  aria-describedby="otp-error"
                  className="mt-1.5 h-14 text-center font-mono text-2xl font-medium tracking-[0.5em] tabular-nums placeholder:text-stone-300"
                  {...otpForm.register('otp')}
                />
                {otpForm.formState.errors.otp ? (
                  <p id="otp-error" className="mt-1.5 text-xs text-status-alarm">
                    {t('login.otpStep.invalidOtp')}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                size="lg"
                className="w-full"
                isLoading={verifyOtp.isPending}
                disabled={verifyOtp.isPending}
              >
                {t('login.otpStep.submit')}
              </Button>
              <button
                type="button"
                onClick={() => setStep('phone')}
                className="block w-full rounded-md py-2 text-sm text-stone-500 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              >
                {t('login.otpStep.back')}
              </button>
            </form>
          )}

          <div className="mt-7 flex justify-center border-t border-stone-100 pt-5">
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm text-stone-500 transition-colors hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <Languages aria-hidden="true" className="h-4 w-4" />
              <span className={isUrdu ? 'font-sans' : 'font-urdu'}>
                {t('language.switchTo')}
              </span>
            </button>
          </div>
        </div>

        {import.meta.env.DEV ? (
          <p className="mt-6 text-center text-xs leading-relaxed text-stone-400">
            {t('login.demoHint')}
          </p>
        ) : null}
      </div>
    </main>
  )
}
