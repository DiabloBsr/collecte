import { useEffect, useRef, useState } from 'react'
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react'
import { signIn } from '../cloud'
import Starfield from '../components/Starfield'
import type { StarfieldHandle } from '../components/Starfield'
import '../login.css'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [ready, setReady] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [errorSeq, setErrorSeq] = useState(0)
  const sky = useRef<StarfieldHandle>(null)
  const cardRef = useRef<HTMLFormElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    const message = await signIn(email.trim(), password)
    setBusy(false)
    if (message) {
      setError(message)
      setErrorSeq((n) => n + 1)
    }
    // Succès : onAuthChange dans App bascule automatiquement vers l'app.
  }

  // Entrée orchestrée : un timer (et non un rAF) pour que le contenu
  // apparaisse même si l'onglet démarre en arrière-plan.
  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), 30)
    return () => window.clearTimeout(id)
  }, [])

  // Chaque échec de connexion secoue la carte (neutralisé par la feuille de
  // style si l'utilisateur demande moins d'animations).
  useEffect(() => {
    if (errorSeq === 0) return
    const el = cardRef.current
    if (!el) return
    el.classList.add('lg-shake')
    const id = window.setTimeout(() => el.classList.remove('lg-shake'), 480)
    return () => {
      window.clearTimeout(id)
      el.classList.remove('lg-shake')
    }
  }, [errorSeq])

  /** Chaque frappe envoie une étincelle du champ vers le ciel. */
  function emitSpark(input: HTMLInputElement, length: number) {
    const r = input.getBoundingClientRect()
    sky.current?.spark(
      r.left + Math.min(r.width - 20, 18 + length * 8.2),
      r.top + r.height / 2,
    )
  }

  /** Inclinaison douce de la carte sous le curseur (pointeur fin uniquement). */
  function tiltCard(e: ReactPointerEvent<HTMLFormElement>) {
    if (e.pointerType !== 'mouse') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    el.style.setProperty('--lg-rx', `${(py * -2.4).toFixed(2)}deg`)
    el.style.setProperty('--lg-ry', `${(px * 3).toFixed(2)}deg`)
  }

  function resetTilt(e: ReactPointerEvent<HTMLFormElement>) {
    e.currentTarget.style.setProperty('--lg-rx', '0deg')
    e.currentTarget.style.setProperty('--lg-ry', '0deg')
  }

  /** Un appui sur le ciel (hors formulaire) y allume une étoile. */
  function lightSky(e: ReactPointerEvent<HTMLDivElement>) {
    const target = e.target
    if (!(target instanceof Element)) return
    if (target.closest('.lg-card, a, button, input, label')) return
    sky.current?.ripple(e.clientX, e.clientY)
  }

  return (
    <div className={ready ? 'lg-root lg-ready' : 'lg-root'} onPointerDown={lightSky}>
      <Starfield ref={sky} className="lg-sky" />
      <div className="lg-nebula" aria-hidden="true" />
      <div className="lg-grain" aria-hidden="true" />

      <main className="lg-stage">
        <section className="lg-brand" aria-label="Présentation de Collecte">
          <p className="lg-eyebrow lg-reveal lg-d1">Enquêtes terrain · Madagascar</p>
          <p className="lg-wordmark lg-reveal lg-d2">
            Collecte<span className="lg-dot">.</span>
          </p>
          <p className="lg-tagline lg-reveal lg-d3">
            Chaque réponse collectée est <em>une étoile de plus</em> dans le ciel de
            vos données.
          </p>
          <ul className="lg-facts lg-reveal lg-d4">
            <li>
              <span className="lg-fact">Hors ligne</span>
              <span className="lg-fact-lbl">collecte sans réseau</span>
            </li>
            <li>
              <span className="lg-fact">Temps réel</span>
              <span className="lg-fact-lbl">base partagée</span>
            </li>
            <li>
              <span className="lg-fact">Madagascar</span>
              <span className="lg-fact-lbl">enquêtes terrain</span>
            </li>
          </ul>
          <p className="lg-hint lg-reveal lg-d5">
            — déplacez le curseur pour relier les étoiles —
          </p>
        </section>

        <section className="lg-panel lg-reveal lg-d3" aria-label="Connexion">
          <form
            ref={cardRef}
            className="lg-card"
            onSubmit={handleSubmit}
            onPointerMove={tiltCard}
            onPointerLeave={resetTilt}
          >
            <h1 className="lg-title">
              Connexion
              <span className="lg-title-star" aria-hidden="true">
                &nbsp;✦
              </span>
            </h1>
            <p className="lg-lead">
              Accès réservé à l’équipe de collecte. Les comptes sont créés par
              l’administrateur.
            </p>

            <div className="lg-field lg-reveal lg-d5">
              <label htmlFor="lg-email">
                Email
                <span className="lg-star" aria-hidden="true">
                  ✦
                </span>
              </label>
              <div className="lg-control">
                <input
                  id="lg-email"
                  type="email"
                  inputMode="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    emitSpark(e.target, e.target.value.length)
                  }}
                  placeholder="vous@exemple.com"
                  required
                />
              </div>
            </div>

            <div className="lg-field lg-reveal lg-d6">
              <label htmlFor="lg-password">
                Mot de passe
                <span className="lg-star" aria-hidden="true">
                  ✦
                </span>
              </label>
              <div className="lg-control">
                <input
                  id="lg-password"
                  ref={passwordRef}
                  className="lg-has-eye"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    emitSpark(e.target, e.target.value.length)
                  }}
                  placeholder="••••••••"
                  required
                />
                <button
                  type="button"
                  className="lg-eye"
                  aria-controls="lg-password"
                  aria-pressed={showPassword}
                  aria-label={
                    showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'
                  }
                  onClick={() => {
                    setShowPassword((v) => !v)
                    passwordRef.current?.focus({ preventScroll: true })
                  }}
                >
                  {showPassword ? (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2 12s3.6-6.5 10-6.5c2 0 3.7.6 5.1 1.5M22 12s-3.6 6.5-10 6.5c-2 0-3.7-.6-5.1-1.5" />
                      <path d="m4 20 16-16" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
                      <circle cx="12" cy="12" r="2.7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {error && (
              <p className="lg-error" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              className="lg-btn lg-reveal lg-d7"
              disabled={busy}
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect()
                e.currentTarget.style.setProperty(
                  '--lg-mx',
                  `${((e.clientX - r.left) / r.width) * 100}%`,
                )
                e.currentTarget.style.setProperty(
                  '--lg-my',
                  `${((e.clientY - r.top) / r.height) * 100}%`,
                )
              }}
            >
              <span className="lg-btn-glow" aria-hidden="true" />
              <span className="lg-btn-sheen" aria-hidden="true" />
              <span className="lg-btn-text">
                {busy ? (
                  <>
                    Connexion…
                    <span className="lg-orbit" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </>
                ) : (
                  'Se connecter'
                )}
              </span>
            </button>
          </form>
        </section>
      </main>

      <footer className="lg-footer lg-reveal lg-d7">
        Les données restent aussi enregistrées sur cet appareil
        <span className="lg-sep" aria-hidden="true">
          ✦
        </span>
        pour le travail hors ligne
      </footer>
    </div>
  )
}
