import { useMutation } from '@tanstack/react-query'

import { apiPost } from '../../services/api/client'
import {
  okResponseSchema,
  verifyOtpResponseSchema,
  type VerifyOtpResponse,
} from '../../types/schemas'

export function useRequestOtpMutation() {
  return useMutation({
    mutationFn: (phone: string) => apiPost('/auth/request-otp', { phone }, okResponseSchema),
  })
}

interface VerifyOtpInput {
  phone: string
  otp: string
}

export function useVerifyOtpMutation() {
  return useMutation<VerifyOtpResponse, Error, VerifyOtpInput>({
    mutationFn: (input) => apiPost('/auth/verify-otp', input, verifyOtpResponseSchema),
  })
}
