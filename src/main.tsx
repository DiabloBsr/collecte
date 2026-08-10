import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Le contenu de secours (filet anti-écran blanc d'index.html) est retiré dès
// que React prend la main.
document.getElementById('boot-fallback')?.remove()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
