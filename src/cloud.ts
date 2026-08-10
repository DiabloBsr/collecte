/**
 * Synchronisation Supabase, offline-first.
 *
 * Le localStorage reste la source de vérité de l'UI : chaque mutation est
 * d'abord écrite en local (l'app marche sans réseau), puis poussée vers la
 * base en tâche de fond. Au démarrage, la base est tirée et fusionnée.
 *
 * Sans VITE_SUPABASE_URL / VITE_SUPABASE_KEY, tout ce module est inerte et
 * l'app fonctionne comme avant (local uniquement) — le client supabase-js
 * n'est même pas chargé (import dynamique).
 */
import type {
  AnswerValue,
  Question,
  QuestionSection,
  QuestionType,
  Submission,
} from './types'

// strip BOM + espaces : une valeur d'env polluée par un caractère invisible
// (BOM, retour ligne d'un copier-coller) casserait les en-têtes HTTP avec
// « String contains non ISO-8859-1 code point ».
function cleanEnv(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(new RegExp('^' + String.fromCharCode(0xfeff)), '').trim()
  return cleaned || undefined
}

const SUPABASE_URL = cleanEnv(import.meta.env.VITE_SUPABASE_URL)
const SUPABASE_KEY = cleanEnv(import.meta.env.VITE_SUPABASE_KEY)

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY)

export type CloudStatus = 'off' | 'syncing' | 'online' | 'error'

// Dernière erreur rencontrée, pour l'afficher à l'utilisateur au lieu d'un
// « injoignable » opaque (ex. « Failed to fetch » = requête bloquée/hors ligne).
let lastError = ''

export function getLastCloudError(): string {
  return lastError
}

function recordError(e: unknown): void {
  lastError = e instanceof Error ? e.message : String(e)
}

type Supabase = import('@supabase/supabase-js').SupabaseClient
export type CloudSession = import('@supabase/supabase-js').Session

let clientPromise: Promise<Supabase> | null = null

function client(): Promise<Supabase> {
  clientPromise ??= import('@supabase/supabase-js').then((m) =>
    m.createClient(SUPABASE_URL as string, SUPABASE_KEY as string),
  )
  return clientPromise
}

/* ─── Authentification ──────────────────────────────────────────────── */

export async function getSession(): Promise<CloudSession | null> {
  if (!cloudEnabled) return null
  try {
    const sb = await client()
    const { data } = await sb.auth.getSession()
    return data.session
  } catch {
    return null
  }
}

/** Connexion email/mot de passe ; renvoie un message d'erreur, null si OK. */
export async function signIn(email: string, password: string): Promise<string | null> {
  if (!cloudEnabled) return 'Base non configurée.'
  try {
    const sb = await client()
    const { error } = await sb.auth.signInWithPassword({ email, password })
    if (!error) return null
    return error.message === 'Invalid login credentials'
      ? 'Email ou mot de passe invalide.'
      : error.message
  } catch (e) {
    recordError(e)
    return 'Connexion impossible — vérifiez le réseau.'
  }
}

/** Jeton d'accès de la session courante (pour appeler l'API admin). */
export async function getAccessToken(): Promise<string | null> {
  if (!cloudEnabled) return null
  try {
    const sb = await client()
    const { data } = await sb.auth.getSession()
    return data.session?.access_token ?? null
  } catch {
    return null
  }
}

export async function signOut(): Promise<void> {
  if (!cloudEnabled) return
  try {
    const sb = await client()
    await sb.auth.signOut()
  } catch {
    // Session locale déjà purgée par supabase-js le cas échéant.
  }
}

export function onAuthChange(cb: (session: CloudSession | null) => void): () => void {
  if (!cloudEnabled) return () => {}
  let unsubscribe: (() => void) | null = null
  void client().then((sb) => {
    const { data } = sb.auth.onAuthStateChange((_event, session) => cb(session))
    unsubscribe = () => data.subscription.unsubscribe()
  })
  return () => unsubscribe?.()
}

/* ─── Temps réel ────────────────────────────────────────────────────── */

/** Appelle cb à chaque changement distant sur questions/submissions. */
export function onRemoteChange(cb: () => void): () => void {
  if (!cloudEnabled) return () => {}
  let channel: import('@supabase/supabase-js').RealtimeChannel | null = null
  void client().then((sb) => {
    channel = sb
      .channel('collecte-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions' }, cb)
      .subscribe()
  })
  return () => {
    if (channel) void channel.unsubscribe()
  }
}

// Les pushes sont sérialisés : deux mutations rapprochées ne peuvent pas
// arriver dans le désordre côté base (le dernier arrivé écraserait sinon
// l'état le plus récent avec un état périmé).
let chain: Promise<unknown> = Promise.resolve()

function serialized<T>(work: () => Promise<T>): Promise<T> {
  const result = chain.then(work, work)
  chain = result.catch(() => undefined)
  return result
}

interface QuestionRow {
  id: string
  label: string
  type: string
  section: string
  options: unknown
  required: boolean
  position: number
  created_at: string
  deleted_at: string | null
}

interface SubmissionRow {
  id: string
  submitted_at: string
  answers: unknown
  deleted_at: string | null
}

function toQuestion(r: QuestionRow): Question {
  const type: QuestionType =
    r.type === 'radio' || r.type === 'checkbox' ? r.type : 'text'
  const section: QuestionSection = r.section === 'identity' ? 'identity' : 'survey'
  return {
    id: r.id,
    label: r.label,
    type,
    section,
    options: Array.isArray(r.options)
      ? r.options.filter((o): o is string => typeof o === 'string')
      : [],
    required: Boolean(r.required),
    createdAt: Date.parse(r.created_at) || Date.now(),
  }
}

function toSubmission(r: SubmissionRow): Submission {
  const answers: Record<string, AnswerValue> = {}
  if (r.answers && typeof r.answers === 'object' && !Array.isArray(r.answers)) {
    for (const [key, value] of Object.entries(r.answers as Record<string, unknown>)) {
      if (typeof value === 'string') answers[key] = value
      else if (Array.isArray(value)) {
        answers[key] = value.filter((v): v is string => typeof v === 'string')
      }
    }
  }
  return {
    id: r.id,
    submittedAt: Date.parse(r.submitted_at) || Date.now(),
    answers,
  }
}

export interface CloudSnapshot {
  questions: Question[]
  submissions: Submission[]
  deletedQuestionIds: string[]
  deletedSubmissionIds: string[]
}

/** Tire tout depuis la base (tombstones séparés) ; null si injoignable. */
export async function pullAll(): Promise<CloudSnapshot | null> {
  if (!cloudEnabled) return null
  try {
    const sb = await client()
    const [q, s] = await Promise.all([
      sb.from('questions').select('*').order('position', { ascending: true }),
      sb.from('submissions').select('*').order('submitted_at', { ascending: true }),
    ])
    if (q.error || s.error) {
      recordError(q.error?.message ?? s.error?.message ?? 'réponse en erreur')
      return null
    }
    const qRows = q.data as QuestionRow[]
    const sRows = s.data as SubmissionRow[]
    return {
      questions: qRows.filter((r) => !r.deleted_at).map(toQuestion),
      submissions: sRows.filter((r) => !r.deleted_at).map(toSubmission),
      deletedQuestionIds: qRows.filter((r) => r.deleted_at).map((r) => r.id),
      deletedSubmissionIds: sRows.filter((r) => r.deleted_at).map((r) => r.id),
    }
  } catch (e) {
    recordError(e)
    return null
  }
}

/** Pousse l'état complet des questions (upsert) + tombstone les retirées. */
export function pushQuestions(next: Question[], removedIds: string[]): Promise<boolean> {
  if (!cloudEnabled) return Promise.resolve(false)
  return serialized(async () => {
    try {
      const sb = await client()
      if (removedIds.length > 0) {
        const now = new Date().toISOString()
        const del = await sb.from('questions').upsert(
          removedIds.map((id) => ({
            id,
            label: '(supprimée)',
            type: 'text',
            section: 'survey',
            options: [],
            required: false,
            position: 0,
            deleted_at: now,
          })),
        )
        if (del.error) return false
      }
      if (next.length > 0) {
        const up = await sb.from('questions').upsert(
          next.map((q, i) => ({
            id: q.id,
            label: q.label,
            type: q.type,
            section: q.section,
            options: q.options,
            required: q.required,
            position: i,
            created_at: new Date(q.createdAt).toISOString(),
            deleted_at: null,
          })),
        )
        if (up.error) {
          recordError(up.error.message)
          return false
        }
      }
      return true
    } catch (e) {
      recordError(e)
      return false
    }
  })
}

/** Pousse les soumissions ajoutées (upsert) + tombstone les retirées. */
export function pushSubmissions(
  added: Submission[],
  removedIds: string[],
): Promise<boolean> {
  if (!cloudEnabled) return Promise.resolve(false)
  return serialized(async () => {
    try {
      const sb = await client()
      if (removedIds.length > 0) {
        const now = new Date().toISOString()
        const del = await sb.from('submissions').upsert(
          removedIds.map((id) => ({
            id,
            submitted_at: now,
            answers: {},
            deleted_at: now,
          })),
        )
        if (del.error) return false
      }
      if (added.length > 0) {
        const up = await sb.from('submissions').upsert(
          added.map((s) => ({
            id: s.id,
            submitted_at: new Date(s.submittedAt).toISOString(),
            answers: s.answers,
            deleted_at: null,
          })),
        )
        if (up.error) {
          recordError(up.error.message)
          return false
        }
      }
      return true
    } catch (e) {
      recordError(e)
      return false
    }
  })
}
