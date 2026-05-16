import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'

import { apiGet, apiPatch, apiPost } from '../../services/api/client'
import { cardSchema, type Card, type CardStatus } from '@fyntra/schemas'

const cardListSchema = z.array(cardSchema)

export const cardKeys = {
  list: (status?: CardStatus) => ['cards', 'list', { status }] as const,
}

export function useCardsQuery(filters: { status?: CardStatus } = {}) {
  const qs = filters.status ? `?status=${filters.status}` : ''
  return useQuery({
    queryKey: cardKeys.list(filters.status),
    queryFn: () => apiGet(`/cards${qs}`, cardListSchema),
    staleTime: 30_000,
  })
}

function invalidateCards(client: ReturnType<typeof useQueryClient>) {
  void client.invalidateQueries({ queryKey: ['cards'] })
  // Card mutations can affect student.cardId, so refresh students too.
  void client.invalidateQueries({ queryKey: ['students'] })
}

export function usePatchCardStatusMutation() {
  const client = useQueryClient()
  return useMutation<Card, Error, { id: string; status: CardStatus }>({
    mutationFn: ({ id, status }) => apiPatch(`/cards/${id}`, { status }, cardSchema),
    onSuccess: () => invalidateCards(client),
  })
}

export function useReplaceCardMutation() {
  const client = useQueryClient()
  return useMutation<Card, Error, { studentId: string; newRfidUid: string }>({
    mutationFn: (input) => apiPost('/cards/replace', input, cardSchema),
    onSuccess: () => invalidateCards(client),
  })
}
