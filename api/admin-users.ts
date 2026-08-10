/**
 * Gestion des comptes — fonction serveur Vercel.
 *
 * La clé service_role ne vit QUE dans l'environnement serveur (jamais dans le
 * bundle client). Chaque requête doit porter le jeton d'un utilisateur dont
 * app_metadata.role === 'admin' (métadonnée modifiable uniquement côté
 * serveur/dashboard — jamais par l'utilisateur lui-même).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    res.status(500).json({ error: 'Configuration serveur incomplète (clé service manquante).' })
    return
  }
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Non authentifié.' })
    return
  }
  const { data: callerData, error: callerError } = await admin.auth.getUser(token)
  const caller = callerData?.user
  if (callerError || !caller) {
    res.status(401).json({ error: 'Session invalide ou expirée.' })
    return
  }
  const callerRole = (caller.app_metadata as Record<string, unknown> | null)?.role
  if (callerRole !== 'admin') {
    res.status(403).json({ error: 'Réservé aux administrateurs.' })
    return
  }

  if (req.method === 'GET') {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }
    res.status(200).json({
      users: data.users.map((u) => ({
        id: u.id,
        email: u.email ?? '(sans email)',
        role:
          (u.app_metadata as Record<string, unknown> | null)?.role === 'admin'
            ? 'admin'
            : 'membre',
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
      })),
    })
    return
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as { email?: unknown; password?: unknown; admin?: unknown }
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    if (!email.includes('@') || password.length < 8) {
      res.status(400).json({
        error: 'Email invalide ou mot de passe trop court (8 caractères minimum).',
      })
      return
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: body.admin === true ? 'admin' : 'membre' },
    })
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(200).json({ id: data.user?.id })
    return
  }

  if (req.method === 'PATCH') {
    const body = (req.body ?? {}) as { id?: unknown; admin?: unknown }
    if (typeof body.id !== 'string') {
      res.status(400).json({ error: 'Identifiant manquant.' })
      return
    }
    if (body.id === caller.id) {
      res.status(400).json({ error: 'Impossible de modifier son propre rôle.' })
      return
    }
    const { error } = await admin.auth.admin.updateUserById(body.id, {
      app_metadata: { role: body.admin === true ? 'admin' : 'membre' },
    })
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  if (req.method === 'DELETE') {
    const body = (req.body ?? {}) as { id?: unknown }
    if (typeof body.id !== 'string') {
      res.status(400).json({ error: 'Identifiant manquant.' })
      return
    }
    if (body.id === caller.id) {
      res.status(400).json({ error: 'Impossible de supprimer son propre compte.' })
      return
    }
    const { error } = await admin.auth.admin.deleteUser(body.id)
    if (error) {
      res.status(400).json({ error: error.message })
      return
    }
    res.status(200).json({ ok: true })
    return
  }

  res.status(405).json({ error: 'Méthode non autorisée.' })
}
