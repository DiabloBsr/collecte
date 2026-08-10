import { useState } from 'react'
import type { FormEvent } from 'react'
import { signIn } from '../cloud'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const message = await signIn(email.trim(), password)
    setBusy(false)
    if (message) setError(message)
    // Succès : onAuthChange dans App bascule automatiquement vers l'app.
  }

  return (
    <main className="login-wrap">
      <div className="card login-card">
        <p className="login-brand">
          Collecte<span className="brand-dot">.</span>
        </p>
        <h1 className="login-title">Connexion</h1>
        <p className="login-lead">
          Accès réservé à l’équipe de collecte. Les comptes sont créés par
          l’administrateur.
        </p>
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Email</span>
            <input
              className="input"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vous@exemple.com"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Mot de passe</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn primary lg login-submit" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
      <p className="login-footnote">
        Les données restent aussi enregistrées sur cet appareil pour le
        travail hors ligne.
      </p>
    </main>
  )
}
