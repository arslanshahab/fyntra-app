import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import App from './app/App'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('Root element #root not found in index.html')
}

async function startMocks(): Promise<void> {
  if (!import.meta.env.DEV) return
  if (import.meta.env.VITE_USE_MOCKS !== 'true') return
  const { worker } = await import('./services/mocks/browser')
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: '/mockServiceWorker.js' },
  })
}

void startMocks().then(() => {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
