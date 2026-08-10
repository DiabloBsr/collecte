import { useCallback, useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import type { ConfirmFn, ConfirmOptions, Question, Submission } from './types'
import {
  QUESTIONS_KEY,
  SUBMISSIONS_KEY,
  loadPending,
  loadQuestions,
  loadSubmissions,
  savePending,
  saveQuestions,
  saveSubmissions,
} from './storage'
import type { CloudSnapshot, CloudStatus } from './cloud'
import {
  cloudEnabled,
  getLastCloudError,
  getSession,
  onAuthChange,
  onRemoteChange,
  pullAll,
  pushQuestions,
  pushSubmissions,
  signOut,
} from './cloud'
import LoginPage from './pages/Login'
import AdminPage from './pages/Admin'
import BuilderPage from './pages/Builder'
import CollectPage from './pages/Collect'
import DashboardPage from './pages/Dashboard'

type Route = 'questions' | 'formulaire' | 'donnees' | 'admin'

const ROUTES: { id: Route; label: string }[] = [
  { id: 'questions', label: 'Questions' },
  { id: 'formulaire', label: 'Formulaire' },
  { id: 'donnees', label: 'Données' },
]

function routeFromHash(): Route {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h === 'admin') return 'admin'
  const found = ROUTES.find((r) => r.id === h)
  return found ? found.id : 'questions'
}

export default function App() {
  const [route, setRoute] = useState<Route>(routeFromHash)
  const [questions, setQuestions] = useState<Question[]>(loadQuestions)
  const [submissions, setSubmissions] = useState<Submission[]>(loadSubmissions)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const mainRef = useRef<HTMLElement>(null)
  const isFirstRoute = useRef(true)
  const [confirmBox, setConfirmBox] = useState<ConfirmOptions | null>(null)
  const confirmResolve = useRef<((ok: boolean) => void) | null>(null)
  const cancelBtnRef = useRef<HTMLButtonElement>(null)
  const lastFocused = useRef<HTMLElement | null>(null)
  const openedAt = useRef(0)
  const pressOnOverlay = useRef(false)
  const [cloud, setCloud] = useState<CloudStatus>(cloudEnabled ? 'syncing' : 'off')
  const [auth, setAuth] = useState<'loading' | 'signedout' | 'signedin'>(
    cloudEnabled ? 'loading' : 'signedin',
  )
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!cloudEnabled) return
    const apply = (session: Awaited<ReturnType<typeof getSession>>) => {
      setAuth(session ? 'signedin' : 'signedout')
      setUserEmail(session?.user.email ?? null)
      setIsAdmin(
        (session?.user.app_metadata as Record<string, unknown> | null)?.role ===
          'admin',
      )
    }
    let active = true
    void getSession().then((session) => {
      if (active) apply(session)
    })
    const off = onAuthChange(apply)
    return () => {
      active = false
      off()
    }
  }, [])

  useEffect(() => {
    const onHash = () => setRoute(routeFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Synchronisation de démarrage : 1) pousse d'abord tout ce qui est en
  // attente (une modification faite hors ligne ne doit jamais être écrasée par
  // un pull) ; 2) tire la base — avec 3 tentatives espacées, un raté transitoire
  // ne doit pas bloquer sur ⚠ — et fusionne par id : les tombstones distants
  // purgent les copies locales périmées, une ligne locale inconnue est semée.
  const syncRunning = useRef(false)

  const runCloudSync = useCallback(async () => {
    if (!cloudEnabled || syncRunning.current) return
    syncRunning.current = true
    setCloud('syncing')
    try {
      const pending = loadPending()
      if (pending.questionsSeq > pending.questionsPushedSeq) {
        const seq = pending.questionsSeq
        if (await pushQuestions(loadQuestions(), [])) {
          const p = loadPending()
          p.questionsPushedSeq = Math.max(p.questionsPushedSeq, seq)
          savePending(p)
        }
      }
      if (pending.deletedSubmissionIds.length > 0) {
        if (await pushSubmissions([], pending.deletedSubmissionIds)) {
          const p = loadPending()
          p.deletedSubmissionIds = p.deletedSubmissionIds.filter(
            (id) => !pending.deletedSubmissionIds.includes(id),
          )
          savePending(p)
        }
      }

      let remote: CloudSnapshot | null = null
      for (const delay of [0, 2500, 6000]) {
        if (delay > 0) await new Promise((r) => window.setTimeout(r, delay))
        remote = await pullAll()
        if (remote) break
      }
      if (!remote) {
        setCloud('error')
        return
      }
      let ok = true

      // Questions : pour un même id la base fait foi ; une question locale
      // inconnue et non tombstonée est conservée puis semée dans la base.
      const deletedQ = new Set(remote.deletedQuestionIds)
      const localQuestions = loadQuestions()
      const remoteQIds = new Set(remote.questions.map((q) => q.id))
      const localOnlyQ = localQuestions.filter(
        (q) => !remoteQIds.has(q.id) && !deletedQ.has(q.id),
      )
      const mergedQuestions = [...remote.questions, ...localOnlyQ]
      setQuestions(mergedQuestions)
      saveQuestions(mergedQuestions)
      if (localOnlyQ.length > 0) {
        ok = (await pushQuestions(mergedQuestions, [])) && ok
      }

      // Soumissions : union par id, moins les tombstones (distants et en
      // attente locale) ; les locales manquantes sont poussées.
      const pendingNow = loadPending()
      const pendingDeleted = new Set(pendingNow.deletedSubmissionIds)
      const deletedS = new Set(remote.deletedSubmissionIds)
      const localSubs = loadSubmissions().filter(
        (s) => !deletedS.has(s.id) && !pendingDeleted.has(s.id),
      )
      const remoteSIds = new Set(remote.submissions.map((s) => s.id))
      const merged = [
        ...remote.submissions,
        ...localSubs.filter((s) => !remoteSIds.has(s.id)),
      ].sort((a, b) => a.submittedAt - b.submittedAt)
      setSubmissions(merged)
      saveSubmissions(merged)
      const missingRemote = localSubs.filter((s) => !remoteSIds.has(s.id))
      if (missingRemote.length > 0) {
        ok = (await pushSubmissions(missingRemote, [])) && ok
      }

      setCloud(ok ? 'online' : 'error')
    } finally {
      syncRunning.current = false
    }
  }, [])

  useEffect(() => {
    if (auth === 'signedin') void runCloudSync()
  }, [auth, runCloudSync])

  // Temps réel : un changement poussé par un autre appareil relance la
  // synchronisation (débouncé — nos propres pushes déclenchent aussi l'événement,
  // le pull qui suit est alors un no-op).
  useEffect(() => {
    if (auth !== 'signedin' || !cloudEnabled) return
    let timer: number | undefined
    const off = onRemoteChange(() => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => void runCloudSync(), 800)
    })
    return () => {
      window.clearTimeout(timer)
      off()
    }
  }, [auth, runCloudSync])

  // Resynchronise l'état quand un AUTRE onglet écrit dans le localStorage
  // (l'événement 'storage' ne se déclenche jamais dans l'onglet qui écrit).
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === QUESTIONS_KEY) setQuestions(loadQuestions())
      if (e.key === null || e.key === SUBMISSIONS_KEY) setSubmissions(loadSubmissions())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  useEffect(() => {
    const label = ROUTES.find((r) => r.id === route)?.label ?? 'Collecte'
    document.title = `${label} — Collecte`
    if (isFirstRoute.current) {
      isFirstRoute.current = false
      return
    }
    const h1 = mainRef.current?.querySelector<HTMLHeadingElement>('h1')
    if (h1) {
      h1.tabIndex = -1
      h1.focus()
    }
  }, [route])

  const notify = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }, [])

  // Panneau de confirmation intégré (remplace window.confirm).
  const confirmAction = useCallback<ConfirmFn>((options) => {
    return new Promise<boolean>((resolve) => {
      if (confirmResolve.current) {
        // Un dialogue était déjà ouvert : on le résout en « annulé » plutôt que
        // de laisser sa promesse suspendue pour toujours.
        confirmResolve.current(false)
      } else {
        lastFocused.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
      }
      confirmResolve.current = resolve
      openedAt.current = performance.now()
      setConfirmBox(options)
    })
  }, [])

  const closeConfirm = useCallback((ok: boolean) => {
    confirmResolve.current?.(ok)
    confirmResolve.current = null
    setConfirmBox(null)
    // La restauration attend le re-render : si le bouton déclencheur a été
    // démonté par l'action confirmée, on replie le focus sur le h1 de la page.
    const target = lastFocused.current
    window.requestAnimationFrame(() => {
      if (target?.isConnected) {
        target.focus()
      } else {
        const h1 = mainRef.current?.querySelector<HTMLHeadingElement>('h1')
        if (h1) {
          h1.tabIndex = -1
          h1.focus()
        }
      }
    })
  }, [])

  // Les clics dans les ~200 ms suivant l'ouverture sont ignorés : le 2e clic
  // d'un double-clic sur le bouton déclencheur ne doit ni annuler ni confirmer.
  function guardedClose(ok: boolean) {
    if (performance.now() - openedAt.current < 200) return
    closeConfirm(ok)
  }

  useEffect(() => {
    if (confirmBox) cancelBtnRef.current?.focus()
    document.body.style.overflow = confirmBox ? 'hidden' : ''
    return () => {
      document.body.style.overflow = ''
    }
  }, [confirmBox])

  function onConfirmKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closeConfirm(false)
      return
    }
    if (e.key === 'Tab') {
      const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('button')
      const first = buttons[0]
      const last = buttons[buttons.length - 1]
      const active = document.activeElement
      if (active !== first && active !== last) {
        // Focus sur le panneau lui-même (clic sur le titre/message) : on ramène
        // le focus sur un bouton au lieu de laisser Tab s'échapper du dialogue.
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
  }

  // Les mutations relisent le stockage au moment d'écrire (base fraîche) pour ne
  // pas écraser ce qu'un autre onglet a enregistré entre-temps, et renvoient
  // false (avec avertissement) si la persistance échoue — l'état mémoire, lui,
  // reste à jour pour permettre l'export depuis la page Données.
  const updateQuestions = useCallback(
    (updater: (current: Question[]) => Question[]) => {
      const current = loadQuestions()
      const next = updater(current)
      setQuestions(next)
      const ok = saveQuestions(next)
      if (!ok) {
        notify('⚠ Stockage local plein ou indisponible : modification non enregistrée sur ce navigateur. Exportez vos données depuis la page Données.')
      }
      if (cloudEnabled) {
        const removed = current
          .filter((q) => !next.some((n) => n.id === q.id))
          .map((q) => q.id)
        const pending = loadPending()
        pending.questionsSeq += 1
        const seq = pending.questionsSeq
        savePending(pending)
        setCloud('syncing')
        void pushQuestions(next, removed).then((sent) => {
          if (sent) {
            const p = loadPending()
            p.questionsPushedSeq = Math.max(p.questionsPushedSeq, seq)
            savePending(p)
          }
          setCloud(sent ? 'online' : 'error')
        })
      }
      return ok
    },
    [notify],
  )

  const updateSubmissions = useCallback(
    (updater: (current: Submission[]) => Submission[]) => {
      const current = loadSubmissions()
      const next = updater(current)
      setSubmissions(next)
      const ok = saveSubmissions(next)
      if (!ok) {
        notify('⚠ Stockage local plein ou indisponible : réponse gardée en mémoire mais non enregistrée. Exportez vos données depuis la page Données.')
      }
      if (cloudEnabled) {
        const added = next.filter((s) => !current.some((c) => c.id === s.id))
        const removed = current
          .filter((s) => !next.some((n) => n.id === s.id))
          .map((s) => s.id)
        if (removed.length > 0) {
          const pending = loadPending()
          pending.deletedSubmissionIds = [
            ...new Set([...pending.deletedSubmissionIds, ...removed]),
          ]
          savePending(pending)
        }
        setCloud('syncing')
        void pushSubmissions(added, removed).then((sent) => {
          if (sent && removed.length > 0) {
            const p = loadPending()
            p.deletedSubmissionIds = p.deletedSubmissionIds.filter(
              (id) => !removed.includes(id),
            )
            savePending(p)
          }
          setCloud(sent ? 'online' : 'error')
        })
      }
      return ok
    },
    [notify],
  )

  if (cloudEnabled && auth === 'loading') {
    return (
      <div className="app">
        <div className="topbar" aria-hidden="true" />
      </div>
    )
  }

  if (cloudEnabled && auth === 'signedout') {
    return (
      <div className="app">
        <div className="topbar" aria-hidden="true" />
        <LoginPage />
      </div>
    )
  }

  // Un non-admin qui tape #/admin retombe sur la page Questions.
  const page: Route = route === 'admin' && !isAdmin ? 'questions' : route

  return (
    <div className="app">
      <div className="topbar" aria-hidden="true" />

      <header className="masthead">
        <div className="brand">
          <a href="#/questions" className="brand-name">
            Collecte<span className="brand-dot">.</span>
          </a>
          <p className="brand-tagline">Carnet de collecte de données</p>
        </div>
        <nav className="nav" aria-label="Navigation principale">
          {ROUTES.map((r) => (
            <a
              key={r.id}
              href={`#/${r.id}`}
              className={route === r.id ? 'nav-link active' : 'nav-link'}
              aria-current={route === r.id ? 'page' : undefined}
            >
              {r.label}
              {r.id === 'questions' && questions.length > 0 && (
                <span className="nav-count">{questions.length}</span>
              )}
              {r.id === 'donnees' && submissions.length > 0 && (
                <span className="nav-count">{submissions.length}</span>
              )}
            </a>
          ))}
          {isAdmin && (
            <a
              href="#/admin"
              className={route === 'admin' ? 'nav-link active' : 'nav-link'}
              aria-current={route === 'admin' ? 'page' : undefined}
            >
              Admin
            </a>
          )}
          {cloudEnabled && userEmail && (
            <button
              type="button"
              className="nav-signout"
              onClick={() => void signOut()}
              title={`Connecté : ${userEmail} — se déconnecter`}
            >
              ⏻
            </button>
          )}
        </nav>
      </header>

      <main className="page" key={page} ref={mainRef}>
        {page === 'questions' && (
          <BuilderPage
            questions={questions}
            submissions={submissions}
            updateQuestions={updateQuestions}
            notify={notify}
            confirmAction={confirmAction}
          />
        )}
        {page === 'formulaire' && (
          <CollectPage
            questions={questions}
            submissions={submissions}
            updateSubmissions={updateSubmissions}
            notify={notify}
          />
        )}
        {page === 'donnees' && (
          <DashboardPage
            questions={questions}
            submissions={submissions}
            updateSubmissions={updateSubmissions}
            notify={notify}
            confirmAction={confirmAction}
          />
        )}
        {page === 'admin' && (
          <AdminPage notify={notify} confirmAction={confirmAction} />
        )}
      </main>

      <footer className="footer">
        {cloud === 'off' && 'Les données restent stockées localement dans ce navigateur.'}
        {cloud === 'syncing' && '☁ Synchronisation avec la base…'}
        {cloud === 'online' && '☁ Synchronisé avec la base — copie locale conservée pour le hors-ligne.'}
        {cloud === 'error' && (
          <>
            {`⚠ Base injoignable (${getLastCloudError() || 'erreur inconnue'}) — données conservées en local. `}
            <button
              type="button"
              className="footer-retry"
              onClick={() => void runCloudSync()}
            >
              Réessayer maintenant
            </button>
          </>
        )}
      </footer>

      {confirmBox && (
        <div
          className="confirm-overlay"
          onMouseDown={(e) => {
            pressOnOverlay.current = e.target === e.currentTarget
          }}
          onClick={(e) => {
            // Ne ferme que si la pression a commencé ET fini sur le fond : une
            // sélection de texte relâchée hors du panneau ne doit pas annuler.
            if (pressOnOverlay.current && e.target === e.currentTarget) {
              guardedClose(false)
            }
            pressOnOverlay.current = false
          }}
        >
          <div
            className="confirm-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby={confirmBox.message ? 'confirm-message' : undefined}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={onConfirmKeyDown}
          >
            <h2 id="confirm-title" className="confirm-title">
              {confirmBox.title}
            </h2>
            {confirmBox.message && (
              <p id="confirm-message" className="confirm-message">
                {confirmBox.message}
              </p>
            )}
            <div className="confirm-actions">
              <button
                ref={cancelBtnRef}
                className="btn ghost"
                onClick={() => guardedClose(false)}
              >
                Annuler
              </button>
              <button
                className={confirmBox.danger ? 'btn solid-danger' : 'btn primary'}
                onClick={() => guardedClose(true)}
              >
                {confirmBox.confirmLabel ?? 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="toast-region" role="status" aria-live="polite">
        {toast && <div className="toast">{toast}</div>}
      </div>
    </div>
  )
}
