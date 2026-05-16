import { env } from '../config/env.js'

export interface SendTemplateInput {
  to: string
  name: string
  languageCode: string
  variables: string[]
}

export interface SendResult {
  dryRun: boolean
  status: 'sent' | 'failed'
  messageId?: string
  errorMessage?: string
}

export async function sendTemplate(input: SendTemplateInput): Promise<SendResult> {
  const e = env()
  if (e.WHATSAPP_DRY_RUN) {
    return { dryRun: true, status: 'sent' }
  }
  const url = `https://graph.facebook.com/v22.0/${e.WHATSAPP_PHONE_NUMBER_ID}/messages`
  const body = {
    messaging_product: 'whatsapp',
    to: input.to.replace(/^\+/, ''),
    type: 'template',
    template: {
      name: input.name,
      language: { code: input.languageCode },
      components:
        input.variables.length > 0
          ? [
              {
                type: 'body',
                parameters: input.variables.map((text) => ({ type: 'text', text })),
              },
            ]
          : [],
    },
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${e.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    return { dryRun: false, status: 'failed', errorMessage: `HTTP ${res.status}: ${text}` }
  }
  const json = (await res.json()) as { messages?: Array<{ id: string }> }
  return { dryRun: false, status: 'sent', messageId: json.messages?.[0]?.id }
}
