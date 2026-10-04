import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'
import { useStackableStore } from './store/useStackableStore'

// Dev server only: lets the browser console poke the store (fake open tabs, toasts).
if (import.meta.env.DEV) {
  ;(window as unknown as { __stackable: typeof useStackableStore }).__stackable = useStackableStore
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
