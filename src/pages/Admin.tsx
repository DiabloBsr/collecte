import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { ConfirmFn } from '../types'
import { getAccessToken } from '../cloud'

interface AdminUser {
  id: string
  email: string
  role: 'admin' | 'membre'
  createdAt: string
  lastSignInAt: string | null
}

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

async function callApi(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  const token = await getAccessToken()
  if (!token) return { ok: false, status: 401, data: { error: 'Session expirée.' } }
  try {
    const response = await fetch('/api/admin-users', {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: response.ok, status: response.status, data }
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: 'API injoignable — vérifiez la connexion.' },
    }
  }
}

function errorOf(data: Record<string, unknown>): string {
  return typeof data.error === 'string' ? data.error : 'Erreur inattendue.'
}

export default function AdminPage({
  notify,
  confirmAction,
}: {
  notify: (message: string) => void
  confirmAction: ConfirmFn
}) {
  const [users, setUsers] = useState<AdminUser[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [makeAdmin, setMakeAdmin] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    const { ok, data } = await callApi('GET')
    if (ok && Array.isArray(data.users)) {
      setUsers(data.users as AdminUser[])
      setLoadError(null)
    } else {
      setUsers(null)
      setLoadError(errorOf(data))
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function generatePassword() {
    const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
    let out = ''
    const rand = new Uint32Array(12)
    crypto.getRandomValues(rand)
    for (const n of rand) out += chars[n % chars.length]
    setPassword(out)
  }

  async function handleCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    const cleanEmail = email.trim()
    if (!cleanEmail.includes('@')) {
      setFormError('Email invalide.')
      return
    }
    if (password.length < 8) {
      setFormError('Mot de passe : 8 caractères minimum.')
      return
    }
    setFormError(null)
    setBusy(true)
    const { ok, data } = await callApi('POST', {
      email: cleanEmail,
      password,
      admin: makeAdmin,
    })
    setBusy(false)
    if (!ok) {
      setFormError(errorOf(data))
      return
    }
    notify(`Compte « ${cleanEmail} » créé — transmettez-lui son mot de passe.`)
    setEmail('')
    setPassword('')
    setMakeAdmin(false)
    void refresh()
  }

  async function toggleRole(user: AdminUser) {
    const promote = user.role !== 'admin'
    const ok = await confirmAction({
      title: promote ? 'Promouvoir en admin ?' : 'Retirer le rôle admin ?',
      message: promote
        ? `« ${user.email} » pourra créer, modifier et supprimer des comptes.\n\nLe changement prend effet à sa prochaine connexion.`
        : `« ${user.email} » ne pourra plus gérer les comptes.\n\nLe changement prend effet à sa prochaine connexion.`,
      confirmLabel: promote ? 'Promouvoir' : 'Retirer',
      danger: !promote,
    })
    if (!ok) return
    const { ok: done, data } = await callApi('PATCH', { id: user.id, admin: promote })
    if (done) {
      notify(promote ? 'Rôle admin accordé' : 'Rôle admin retiré')
      void refresh()
    } else {
      notify(`⚠ ${errorOf(data)}`)
    }
  }

  async function removeUser(user: AdminUser) {
    const ok = await confirmAction({
      title: 'Supprimer ce compte ?',
      message: `« ${user.email} » ne pourra plus se connecter. Les données déjà collectées sont conservées.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const { ok: done, data } = await callApi('DELETE', { id: user.id })
    if (done) {
      notify('Compte supprimé')
      void refresh()
    } else {
      notify(`⚠ ${errorOf(data)}`)
    }
  }

  return (
    <>
      <p className="kicker">04 — Administrer</p>
      <h1 className="page-title">Comptes de l’équipe</h1>
      <p className="page-lead">
        Créez ici les accès de vos enquêteurs — aucun besoin de toucher à
        Supabase. Un membre peut collecter et consulter ; un admin gère en plus
        les comptes.
      </p>

      <div className="builder-grid">
        <aside className="builder-aside">
          <div className="card panel">
            <div className="panel-head">
              <h2 className="panel-title">Nouveau compte</h2>
            </div>
            <div className="panel-body">
              <form onSubmit={handleCreate}>
                <label className="field">
                  <span className="field-label">Email</span>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="enqueteur@exemple.com"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Mot de passe</span>
                  <div className="option-row">
                    <input
                      className="input"
                      type="text"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="8 caractères minimum"
                    />
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={generatePassword}
                    >
                      Générer
                    </button>
                  </div>
                </label>
                <label className="check-line">
                  <input
                    type="checkbox"
                    checked={makeAdmin}
                    onChange={(e) => setMakeAdmin(e.target.checked)}
                  />
                  <span>Administrateur (peut gérer les comptes)</span>
                </label>
                {formError && (
                  <p className="form-error" role="alert">
                    {formError}
                  </p>
                )}
                <button type="submit" className="btn primary" disabled={busy}>
                  {busy ? 'Création…' : 'Créer le compte'}
                </button>
              </form>
            </div>
          </div>
        </aside>

        <section aria-label="Comptes existants">
          {users === null && !loadError && <p className="section-hint">Chargement…</p>}
          {loadError && (
            <div className="empty">
              <p className="empty-title">Impossible de charger les comptes.</p>
              <p className="empty-text">{loadError}</p>
              <button className="btn ghost" onClick={() => void refresh()}>
                Réessayer
              </button>
            </div>
          )}
          {users && (
            <ul className="user-list">
              {users.map((u) => (
                <li key={u.id} className="card user-card">
                  <div className="user-head">
                    <span className="user-email" title={u.email}>
                      {u.email}
                    </span>
                    <span className={u.role === 'admin' ? 'role-chip admin' : 'role-chip'}>
                      {u.role}
                    </span>
                  </div>
                  <p className="user-meta">
                    Créé le {dateFmt.format(new Date(u.createdAt))}
                    {' · '}
                    {u.lastSignInAt
                      ? `dernière connexion ${dateFmt.format(new Date(u.lastSignInAt))}`
                      : 'jamais connecté'}
                  </p>
                  <div className="user-actions">
                    <button className="btn ghost sm" onClick={() => void toggleRole(u)}>
                      {u.role === 'admin' ? 'Rétrograder' : 'Promouvoir admin'}
                    </button>
                    <button
                      className="btn danger sm"
                      onClick={() => void removeUser(u)}
                      aria-label={`Supprimer le compte ${u.email}`}
                    >
                      Supprimer
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
