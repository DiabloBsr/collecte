export type QuestionType = 'text' | 'number' | 'radio' | 'checkbox'

export type QuestionSection = 'identity' | 'survey'

export interface Questionnaire {
  id: string
  name: string
  goal: number | null
  createdAt: number
}

export const DEFAULT_QUESTIONNAIRE_ID = 'q-default'

export interface Question {
  id: string
  label: string
  type: QuestionType
  section: QuestionSection
  options: string[]
  required: boolean
  createdAt: number
  questionnaireId: string
}

export type AnswerValue = string | string[]

export interface Submission {
  id: string
  submittedAt: number
  answers: Record<string, AnswerValue>
  questionnaireId: string
  collectorEmail?: string
  collectorName?: string
  lat?: number
  lng?: number
}

export const TYPE_LABELS: Record<QuestionType, string> = {
  text: 'Texte libre',
  number: 'Nombre',
  radio: 'Choix unique',
  checkbox: 'Choix multiples',
}

/** Types à réponse libre (un input), par opposition aux types à options. */
export function isChoiceType(type: QuestionType): boolean {
  return type === 'radio' || type === 'checkbox'
}

export const SECTION_LABELS: Record<QuestionSection, string> = {
  identity: 'Fiche répondant',
  survey: 'Questionnaire',
}

export interface IdentityPreset {
  label: string
  type: QuestionType
  options: string[]
}

export interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>
