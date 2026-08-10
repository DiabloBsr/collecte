export type QuestionType = 'text' | 'radio' | 'checkbox'

export type QuestionSection = 'identity' | 'survey'

export interface Question {
  id: string
  label: string
  type: QuestionType
  section: QuestionSection
  options: string[]
  required: boolean
  createdAt: number
}

export type AnswerValue = string | string[]

export interface Submission {
  id: string
  submittedAt: number
  answers: Record<string, AnswerValue>
}

export const TYPE_LABELS: Record<QuestionType, string> = {
  text: 'Texte libre',
  radio: 'Choix unique',
  checkbox: 'Choix multiples',
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
