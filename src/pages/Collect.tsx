import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { AnswerValue, Question, Submission } from '../types'
import { uid } from '../storage'

type Step = 'infos' | 'survey'

export default function CollectPage({
  questions,
  submissions,
  updateSubmissions,
  notify,
}: {
  questions: Question[]
  submissions: Submission[]
  updateSubmissions: (updater: (current: Submission[]) => Submission[]) => boolean
  notify: (message: string) => void
}) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})
  const [step, setStep] = useState<Step>('infos')
  // Position de lecture du questionnaire, restaurée quand on revient de l'étape 1.
  const savedScroll = useRef(0)

  const identity = useMemo(
    () => questions.filter((q) => q.section === 'identity'),
    [questions],
  )
  const survey = useMemo(
    () => questions.filter((q) => q.section === 'survey'),
    [questions],
  )
  const hasInfos = identity.length > 0
  const hasSurvey = survey.length > 0
  const effectiveStep: Step = !hasInfos ? 'survey' : !hasSurvey ? 'infos' : step

  const recapItems = useMemo(
    () =>
      identity
        .map((q) => ({ id: q.id, label: q.label, value: answers[q.id] }))
        .filter((it) =>
          Array.isArray(it.value)
            ? it.value.length > 0
            : typeof it.value === 'string' && it.value.trim() !== '',
        )
        .map((it) => ({
          id: it.id,
          label: it.label,
          value: Array.isArray(it.value) ? it.value.join(', ') : (it.value as string),
        })),
    [identity, answers],
  )

  function setAnswer(id: string, value: AnswerValue) {
    setAnswers((prev) => ({ ...prev, [id]: value }))
    setErrors((prev) => (prev[id] ? { ...prev, [id]: false } : prev))
  }

  function toggleCheckbox(id: string, option: string) {
    const current = answers[id]
    const list = Array.isArray(current) ? current : []
    const next = list.includes(option)
      ? list.filter((o) => o !== option)
      : [...list, option]
    setAnswer(id, next)
  }

  function isEmpty(q: Question): boolean {
    const v = answers[q.id]
    if (q.type === 'checkbox') return !Array.isArray(v) || v.length === 0
    return typeof v !== 'string' || v.trim() === ''
  }

  function findMissing(list: Question[]): Record<string, boolean> {
    const missing: Record<string, boolean> = {}
    for (const q of list) {
      if (q.required && isEmpty(q)) missing[q.id] = true
    }
    return missing
  }

  function focusFirstMissing(missing: Record<string, boolean>, list: Question[]) {
    const first = list.find((q) => missing[q.id])
    if (!first) return
    const field = document.querySelector<HTMLElement>(`#q-${first.id} input`)
    field?.focus({ preventScroll: true })
    document
      .getElementById(`q-${first.id}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  function continueToSurvey() {
    const missing = findMissing(identity)
    setErrors(missing)
    if (Object.keys(missing).length > 0) {
      focusFirstMissing(missing, identity)
      return
    }
    setStep('survey')
    // Reprend le questionnaire là où on l'avait laissé.
    window.requestAnimationFrame(() => window.scrollTo({ top: savedScroll.current }))
  }

  function backToInfos() {
    savedScroll.current = window.scrollY
    setStep('infos')
    window.scrollTo({ top: 0 })
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const ordered = [...identity, ...survey]
    const missing = findMissing(ordered)
    setErrors(missing)

    if (Object.keys(missing).length > 0) {
      const missingInfos = identity.some((q) => missing[q.id])
      if (missingInfos && effectiveStep === 'survey') {
        // Une info obligatoire manque : on ramène l'utilisateur à l'étape 1.
        savedScroll.current = window.scrollY
        setStep('infos')
        notify('Des informations obligatoires manquent.')
        window.requestAnimationFrame(() => focusFirstMissing(missing, identity))
      } else {
        focusFirstMissing(missing, effectiveStep === 'infos' ? identity : ordered)
      }
      return
    }

    const clean: Record<string, AnswerValue> = {}
    for (const q of ordered) {
      if (isEmpty(q)) continue
      const v = answers[q.id]
      clean[q.id] = q.type === 'checkbox' ? (v as string[]) : (v as string).trim()
    }
    if (Object.keys(clean).length === 0) {
      notify('Réponse vide — rien à enregistrer.')
      return
    }
    const submission: Submission = { id: uid(), submittedAt: Date.now(), answers: clean }
    const ok = updateSubmissions((current) => [...current, submission])
    setAnswers({})
    setErrors({})
    setStep('infos')
    savedScroll.current = 0
    if (ok) notify('Réponse enregistrée ✓')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function renderAsk(q: Question, index: number | null, compact = false) {
    const wrapperClass = compact
      ? errors[q.id]
        ? 'fiche-field error'
        : 'fiche-field'
      : errors[q.id]
        ? 'ask error'
        : 'ask'
    // Un groupe de choix nombreux occupe toute la largeur de la grille.
    const spanFull = compact && q.type !== 'text' && q.options.length > 3
    return (
      <div
        key={q.id}
        id={`q-${q.id}`}
        className={wrapperClass}
        style={spanFull ? { gridColumn: '1 / -1' } : undefined}
        role={q.type === 'radio' ? 'radiogroup' : 'group'}
        aria-labelledby={`ql-${q.id}`}
        aria-required={q.type !== 'text' && q.required ? true : undefined}
        aria-invalid={q.type === 'radio' && errors[q.id] ? true : undefined}
        aria-describedby={errors[q.id] ? `qe-${q.id}` : undefined}
      >
        <div className="ask-legend">
          {index !== null && (
            <span className="q-index">{String(index + 1).padStart(2, '0')}</span>
          )}
          {q.type === 'text' ? (
            <label id={`ql-${q.id}`} htmlFor={`qi-${q.id}`} className="ask-label">
              {q.label}
              {q.required && (
                <span className="req" aria-hidden="true">
                  {' '}
                  *
                </span>
              )}
            </label>
          ) : (
            <span id={`ql-${q.id}`} className="ask-label">
              {q.label}
              {q.required && (
                <>
                  <span className="req" aria-hidden="true">
                    {' '}
                    *
                  </span>
                  <span className="sr-only"> (obligatoire)</span>
                </>
              )}
            </span>
          )}
        </div>

        {q.type === 'text' && (
          <input
            id={`qi-${q.id}`}
            className="input"
            type="text"
            value={typeof answers[q.id] === 'string' ? (answers[q.id] as string) : ''}
            onChange={(e) => setAnswer(q.id, e.target.value)}
            placeholder="Votre réponse…"
            aria-required={q.required}
            aria-invalid={errors[q.id] || undefined}
            aria-describedby={errors[q.id] ? `qe-${q.id}` : undefined}
          />
        )}

        {q.type === 'radio' && (
          <div className="choice-list inline">
            {q.options.map((o) => (
              <label key={o} className="choice">
                <input
                  type="radio"
                  name={`q-${q.id}`}
                  checked={answers[q.id] === o}
                  onChange={() => setAnswer(q.id, o)}
                  onClick={() => {
                    if (answers[q.id] === o) setAnswer(q.id, '')
                  }}
                />
                <span>{o}</span>
              </label>
            ))}
          </div>
        )}

        {q.type === 'checkbox' && (
          <div className="choice-list inline">
            {q.options.map((o) => {
              const v = answers[q.id]
              const list = Array.isArray(v) ? v : []
              return (
                <label key={o} className="choice">
                  <input
                    type="checkbox"
                    checked={list.includes(o)}
                    onChange={() => toggleCheckbox(q.id, o)}
                    aria-invalid={errors[q.id] || undefined}
                  />
                  <span>{o}</span>
                </label>
              )
            })}
          </div>
        )}

        {errors[q.id] && (
          <p id={`qe-${q.id}`} className="ask-error" role="alert">
            Réponse requise.
          </p>
        )}
      </div>
    )
  }

  return (
    <>
      <p className="kicker">02 — Collecter</p>
      <h1 className="page-title">Saisir une réponse</h1>
      <p className="page-lead">
        Deux étapes : d’abord les <strong>informations</strong> de la personne
        interrogée, puis la <strong>collecte des données</strong>. Vous pouvez
        revenir modifier les informations à tout moment — le questionnaire reprend
        exactement là où vous en étiez. Les champs marqués{' '}
        <span className="req">*</span> sont obligatoires.
      </p>

      {questions.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Le questionnaire est encore vide.</p>
          <p className="empty-text">
            Commencez par composer vos questions, puis revenez ici pour collecter.
          </p>
          <a className="btn primary" href="#/questions">
            Composer le questionnaire
          </a>
        </div>
      ) : (
        <>
          {hasInfos && hasSurvey && (
            <nav className="stepper" aria-label="Étapes du formulaire">
              <button
                type="button"
                className={
                  effectiveStep === 'infos' ? 'step-btn active' : 'step-btn done'
                }
                onClick={backToInfos}
                disabled={effectiveStep === 'infos'}
                aria-current={effectiveStep === 'infos' ? 'step' : undefined}
              >
                <span className="step-num">01</span>
                <span>Informations</span>
              </button>
              <span className="step-line" aria-hidden="true" />
              <button
                type="button"
                className={effectiveStep === 'survey' ? 'step-btn active' : 'step-btn'}
                onClick={continueToSurvey}
                disabled={effectiveStep === 'survey'}
                aria-current={effectiveStep === 'survey' ? 'step' : undefined}
              >
                <span className="step-num">02</span>
                <span>Collecte des données</span>
              </button>
            </nav>
          )}

          <form className="collect-form" onSubmit={handleSubmit} noValidate>
            {effectiveStep === 'infos' ? (
              <>
                <div className="card fiche">
                  <h2 className="fiche-title">Personne interrogée</h2>
                  <div className="fiche-grid">
                    {identity.map((q) => renderAsk(q, null, true))}
                  </div>
                </div>
                <div className="collect-actions">
                  {hasSurvey ? (
                    <button
                      type="button"
                      className="btn primary lg"
                      onClick={continueToSurvey}
                    >
                      Continuer vers le questionnaire →
                    </button>
                  ) : (
                    <button type="submit" className="btn primary lg">
                      Enregistrer la réponse
                    </button>
                  )}
                  <span className="collect-count">
                    {submissions.length} réponse{submissions.length > 1 ? 's' : ''} au
                    total
                  </span>
                </div>
              </>
            ) : (
              <>
                {hasInfos && (
                  <div className="card infos-recap">
                    <div className="recap-body">
                      <span className="field-label">Personne interrogée</span>
                      {recapItems.length > 0 ? (
                        <ul className="recap-list">
                          {recapItems.map((it) => (
                            <li key={it.id}>
                              <strong>{it.label}</strong> : {it.value}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="recap-empty">Aucune information saisie.</p>
                      )}
                    </div>
                    <button type="button" className="btn ghost sm" onClick={backToInfos}>
                      ← Modifier les informations
                    </button>
                  </div>
                )}
                {survey.map((q, i) => renderAsk(q, i))}
                <div className="collect-actions">
                  <button type="submit" className="btn primary lg">
                    Enregistrer la réponse
                  </button>
                  <span className="collect-count">
                    {submissions.length} réponse{submissions.length > 1 ? 's' : ''} au
                    total
                  </span>
                </div>
              </>
            )}
          </form>
        </>
      )}
    </>
  )
}
