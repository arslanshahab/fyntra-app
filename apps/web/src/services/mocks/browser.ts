import { setupWorker } from 'msw/browser'

import { handlers } from './handlers'

// Dev-only worker. main.tsx starts this when VITE_USE_MOCKS=true.
export const worker = setupWorker(...handlers)
