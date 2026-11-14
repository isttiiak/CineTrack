import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { setupPwa } from './lib/pwa.ts'
import { applyPendingWipe } from './lib/localData.ts'
import { detectConsentRegion } from './lib/consent.ts'

applyPendingWipe()     // must run before anything reads local storage
setupPwa()
void detectConsentRegion()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
