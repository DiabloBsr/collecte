import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import type { ConfirmFn } from '../types'
import { getSession, signOut, updateProfile } from '../cloud'

/** Recadre l'image au carré et la compresse (~10-20 Ko) pour les métadonnées. */
async function resizeToDataUrl(file: File, size = 192): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas indisponible')
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size)
  return canvas.toDataURL('image/jpeg', 0.82)
}

export default function ProfilePage({
  notify,
  confirmAction,
}: {
  notify: (message: string) => void
  confirmAction: ConfirmFn
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'admin' | 'membre'>('membre')
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [fonction, setFonction] = useState('')
  const [avatar, setAvatar] = useState('')
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void getSession().then((session) => {
      if (!session) return
      setEmail(session.user.email ?? '')
      setRole(
        (session.user.app_metadata as Record<string, unknown> | null)?.role ===
          'admin'
          ? 'admin'
          : 'membre',
      )
      const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>
      setDisplayName(typeof meta.display_name === 'string' ? meta.display_name : '')
      setPhone(typeof meta.phone === 'string' ? meta.phone : '')
      setFonction(typeof meta.fonction === 'string' ? meta.fonction : '')
      setAvatar(typeof meta.avatar === 'string' ? meta.avatar : '')
    })
  }, [])

  async function handlePhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      notify('⚠ Choisissez une image (JPEG, PNG…).')
      return
    }
    if (file.size > 12 * 1024 * 1024) {
      notify('⚠ Image trop lourde (12 Mo max).')
      return
    }
    try {
      setAvatar(await resizeToDataUrl(file))
      notify('Photo prête — pensez à enregistrer.')
    } catch {
      notify('⚠ Impossible de lire cette image.')
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    const error = await updateProfile({
      display_name: displayName.trim(),
      phone: phone.trim(),
      fonction: fonction.trim(),
      avatar,
    })
    setBusy(false)
    notify(error ? `⚠ ${error}` : 'Profil enregistré ✓')
  }

  async function handleSignOut() {
    const ok = await confirmAction({
      title: 'Se déconnecter ?',
      message: `Vous êtes connecté en tant que ${email}.\n\nLes données restent enregistrées sur cet appareil et dans la base.`,
      confirmLabel: 'Se déconnecter',
    })
    if (ok) await signOut()
  }

  const initials =
    (displayName.trim() || email)
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('') || '?'

  return (
    <>
      <p className="kicker">Profil</p>
      <h1 className="page-title">Mon profil</h1>
      <p className="page-lead">
        Ces informations sont rattachées à votre compte et visibles de votre
        équipe.
      </p>

      <div className="card profile-card">
        <div className="profile-avatar-row">
          <div className="avatar-lg" aria-hidden="true">
            {avatar ? <img src={avatar} alt="" /> : <span>{initials}</span>}
          </div>
          <div className="profile-avatar-actions">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void handlePhoto(e)}
            />
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => fileRef.current?.click()}
            >
              Changer la photo
            </button>
            {avatar && (
              <button
                type="button"
                className="btn danger sm"
                onClick={() => setAvatar('')}
              >
                Retirer
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="profile-grid">
            <label className="field">
              <span className="field-label">Nom affiché</span>
              <input
                className="input"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ex. Samy R."
              />
            </label>
            <label className="field">
              <span className="field-label">Téléphone</span>
              <input
                className="input"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+261 …"
              />
            </label>
            <label className="field">
              <span className="field-label">Fonction</span>
              <input
                className="input"
                type="text"
                value={fonction}
                onChange={(e) => setFonction(e.target.value)}
                placeholder="Ex. Enquêteur zone Nord"
              />
            </label>
            <label className="field">
              <span className="field-label">Email (compte)</span>
              <input className="input" type="email" value={email} disabled />
            </label>
          </div>

          <p className="profile-role">
            Rôle :{' '}
            <span className={role === 'admin' ? 'role-chip admin' : 'role-chip'}>
              {role}
            </span>
          </p>

          <div className="form-actions profile-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            <span className="toolbar-spacer" />
            <button
              type="button"
              className="btn ghost"
              onClick={() => void handleSignOut()}
            >
              Se déconnecter
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
