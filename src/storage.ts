import type { IdentityPreset, Question, Submission } from './types'

export const QUESTIONS_KEY = 'collecte.questions.v1'
export const SUBMISSIONS_KEY = 'collecte.submissions.v1'
export const PRESETS_KEY = 'collecte.presets.v1'
const PENDING_KEY = 'collecte.pending.v1'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as T
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    // Stockage plein ou indisponible : l'état reste en mémoire pour la session.
    return false
  }
}

export function loadQuestions(): Question[] {
  const list = read<Question[]>(QUESTIONS_KEY, [])
  if (!Array.isArray(list)) return []
  // Migration : les questions créées avant l'ajout des sections vont au questionnaire.
  return list.map((q) => ({
    ...q,
    section: q.section === 'identity' ? 'identity' : 'survey',
  }))
}

export function saveQuestions(questions: Question[]): boolean {
  return write(QUESTIONS_KEY, questions)
}

export function loadSubmissions(): Submission[] {
  const list = read<Submission[]>(SUBMISSIONS_KEY, [])
  return Array.isArray(list) ? list : []
}

export function saveSubmissions(submissions: Submission[]): boolean {
  return write(SUBMISSIONS_KEY, submissions)
}

export function loadPresets(): IdentityPreset[] {
  const list = read<IdentityPreset[]>(PRESETS_KEY, [])
  if (!Array.isArray(list)) return []
  return list
    .filter((p) => p && typeof p.label === 'string' && Array.isArray(p.options))
    .map((p) => ({
      label: p.label,
      type: p.type === 'radio' || p.type === 'checkbox' ? p.type : 'text',
      options: p.options.filter((o): o is string => typeof o === 'string'),
    }))
}

export function savePresets(presets: IdentityPreset[]): boolean {
  return write(PRESETS_KEY, presets)
}

/**
 * Travail de synchronisation en attente, persisté pour survivre à un
 * rechargement : tant que `questionsSeq > questionsPushedSeq`, l'état local des
 * questions n'a pas été poussé avec succès ; `deletedSubmissionIds` retient les
 * suppressions dont le tombstone n'est pas encore parti.
 */
export interface PendingSync {
  questionsSeq: number
  questionsPushedSeq: number
  deletedSubmissionIds: string[]
}

export function loadPending(): PendingSync {
  const p = read<PendingSync>(PENDING_KEY, {
    questionsSeq: 0,
    questionsPushedSeq: 0,
    deletedSubmissionIds: [],
  })
  return {
    questionsSeq: typeof p.questionsSeq === 'number' ? p.questionsSeq : 0,
    questionsPushedSeq:
      typeof p.questionsPushedSeq === 'number' ? p.questionsPushedSeq : 0,
    deletedSubmissionIds: Array.isArray(p.deletedSubmissionIds)
      ? p.deletedSubmissionIds.filter((x): x is string => typeof x === 'string')
      : [],
  }
}

export function savePending(pending: PendingSync): void {
  write(PENDING_KEY, pending)
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
