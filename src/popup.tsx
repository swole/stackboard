import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SaveTabPopup from './SaveTabPopup'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SaveTabPopup />
  </StrictMode>,
)
