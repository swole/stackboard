import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SaveTabPopup from './SaveTabPopup'
import './styles/index.css'
import { initAppearance } from './store/useAppearance'

initAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SaveTabPopup />
  </StrictMode>,
)
