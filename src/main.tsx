import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './ErrorBoundary'
import './styles.css'

// Le contenu de secours (filet anti-écran blanc d'index.html) n'est retiré
// QU'APRÈS le premier rendu réussi : si le boot plante, l'écran de secours
// reste affiché et l'auto-réparation peut faire son travail.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)

requestAnimationFrame(() => {
  document.getElementById('boot-fallback')?.remove()
})
