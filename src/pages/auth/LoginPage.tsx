import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { Button } from '../../components/atoms/Button'
import { Input } from '../../components/atoms/Input'
import { useRequestOtpMutation, useVerifyOtpMutation } from '../../features/auth/mutations'
import { ApiError } from '../../services/api/client'
import { useAuthStore } from '../../stores/auth'

const phoneSchema = z.object({
  phone: z.string().regex(/^\+92\d{10}$/, 'invalid'),
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
      if (result.user.preferredLanguage !== i18n.language.split('-')[0]) {
        void i18n.changeLanguage(result.user.preferredLanguage)
      }
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

  return (
    <main className="min-h-dvh flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              {t('app.name')}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {t('login.heading')}
            </h1>
          </div>
          <button
            type="button"
            onClick={toggleLanguage}
            aria-label={t('language.switchTo')}
            className="text-xs font-medium text-brand-600 hover:text-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded"
          >
            {t('language.switchTo')}
          </button>
        </div>

        {topError ? (
          <div
            role="alert"
            className="mt-4 rounded-lg bg-status-alarm/10 px-3 py-2 text-sm text-status-alarm"
          >
            {topError}
          </div>
        ) : null}

        {step === 'phone' ? (
          <form noValidate className="mt-6 space-y-4" onSubmit={onSubmitPhone}>
            <p className="text-sm text-slate-600">{t('login.phoneStep.body')}</p>
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-slate-700">
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
                className="mt-1"
                {...phoneForm.register('phone')}
              />
              {phoneForm.formState.errors.phone ? (
                <p id="phone-error" className="mt-1 text-xs text-status-alarm">
                  {t('login.phoneStep.invalidPhone')}
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              className="w-full"
              isLoading={requestOtp.isPending}
              disabled={requestOtp.isPending}
            >
              {t('login.phoneStep.submit')}
            </Button>
          </form>
        ) : (
          <form noValidate className="mt-6 space-y-4" onSubmit={onSubmitOtp}>
            <p className="text-sm text-slate-600">{t('login.otpStep.body', { phone })}</p>
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-slate-700">
                {t('login.otpStep.otpLabel')}
              </label>
              <Input
                id="otp"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={4}
                placeholder="1234"
                hasError={!!otpForm.formState.errors.otp}
                aria-describedby="otp-error"
                className="mt-1 tracking-[0.5em] text-center"
                {...otpForm.register('otp')}
              />
              {otpForm.formState.errors.otp ? (
                <p id="otp-error" className="mt-1 text-xs text-status-alarm">
                  {t('login.otpStep.invalidOtp')}
                </p>
              ) : null}
            </div>
            <Button
              type="submit"
              className="w-full"
              isLoading={verifyOtp.isPending}
              disabled={verifyOtp.isPending}
            >
              {t('login.otpStep.submit')}
            </Button>
            <button
              type="button"
              onClick={() => setStep('phone')}
              className="w-full text-sm text-slate-500 hover:text-slate-700 focus:outline-none focus-visible:underline"
            >
              {t('login.otpStep.back')}
            </button>
          </form>
        )}

        <p className="mt-6 text-xs leading-relaxed text-slate-400">{t('login.demoHint')}</p>
      </div>
    </main>
  )
}
