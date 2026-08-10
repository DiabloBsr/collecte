import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/**
 * Dernier rempart : une exception pendant le rendu React démonte tout l'arbre
 * et laisse une page vide. On affiche plutôt un écran lisible avec de quoi
 * s'en sortir (recharger, ou repartir sur des données locales saines).
 */
export default class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Collecte — erreur de rendu :', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="crash-screen">
        <p className="crash-brand">
          Collecte<span className="brand-dot">.</span>
        </p>
        <h1 className="crash-title">Une erreur est survenue</h1>
        <p className="crash-text">
          L’application n’a pas pu s’afficher. Vos données restent enregistrées
          (sur cet appareil et dans la base).
        </p>
        <pre className="crash-detail">{this.state.error.message}</pre>
        <div className="crash-actions">
          <button className="btn primary" onClick={() => window.location.reload()}>
            Recharger
          </button>
          <button
            className="btn ghost"
            onClick={() => {
              void (async () => {
                try {
                  if (window.caches) {
                    const names = await caches.keys()
                    await Promise.all(names.map((n) => caches.delete(n)))
                  }
                  if (navigator.serviceWorker?.getRegistrations) {
                    const regs = await navigator.serviceWorker.getRegistrations()
                    await Promise.all(regs.map((r) => r.unregister()))
                  }
                } finally {
                  window.location.reload()
                }
              })()
            }}
          >
            Vider le cache et recharger
          </button>
        </div>
      </div>
    )
  }
}
