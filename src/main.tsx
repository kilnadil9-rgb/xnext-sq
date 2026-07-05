import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { AppErrorBoundary } from './components/ui/AppErrorBoundary'
import { initCrashLog } from './lib/crashLog'

// Install global error capture BEFORE first render so even startup crashes
// land in the local crash log (RC1 - beta black box).
initCrashLog()

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element in index.html')

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
)
