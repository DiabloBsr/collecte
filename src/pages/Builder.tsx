import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  ConfirmFn,
  IdentityPreset,
  Question,
  QuestionSection,
  QuestionType,
  Submission,
} from '../types'
import { SECTION_LABELS, TYPE_LABELS, isChoiceType } from '../types'
import { PRESETS_KEY, loadPresets, savePresets, uid } from '../storage'

interface QuestionValues {
  label: string
  type: QuestionType
  section: QuestionSection
  options: string[]
  required: boolean
}

const TYPE_CHOICES: { id: QuestionType; glyph: string; hint: string }[] = [
  { id: 'text', glyph: 'Aa', hint: 'Réponse libre, input simple' },
  { id: 'number', glyph: '123', hint: 'Valeur numérique (âge, quantité…)' },
  { id: 'radio', glyph: '◉', hint: 'Une seule option possible' },
  { id: 'checkbox', glyph: '▣', hint: 'Plusieurs options possibles' },
]

const SECTION_CHOICES: { id: QuestionSection; hint: string }[] = [
  {
    id: 'identity',
    hint: 'Qui on interroge — infos de la personne (nom, âge…), saisies à l’étape 1.',
  },
  {
    id: 'survey',
    hint: 'Ce qu’on lui demande — les questions de l’enquête, saisies à l’étape 2.',
  },
]

const IDENTITY_PRESETS: IdentityPreset[] = [
  { label: 'Nom', type: 'text', options: [] },
  { label: 'Prénom', type: 'text', options: [] },
  { label: 'Âge', type: 'number', options: [] },
  { label: 'Sexe', type: 'radio', options: ['Femme', 'Homme', 'Autre'] },
  { label: 'Téléphone', type: 'text', options: [] },
  { label: 'Email', type: 'text', options: [] },
  { label: 'Localité', type: 'text', options: [] },
]

function PresetCreator({
  existingLabels,
  onCreate,
}: {
  existingLabels: string[]
  onCreate: (preset: IdentityPreset) => void
}) {
  const [label, setLabel] = useState('')
  const [type, setType] = useState<QuestionType>('text')
  const [optionsText, setOptionsText] = useState('')
  const [error, setError] = useState<string | null>(null)

  function submit() {
    const cleanLabel = label.trim()
    if (!cleanLabel) {
      setError('L’intitulé est obligatoire.')
      return
    }
    if (existingLabels.some((l) => l.toLowerCase() === cleanLabel.toLowerCase())) {
      setError('Un raccourci porte déjà ce nom.')
      return
    }
    let options: string[] = []
    if (type !== 'text') {
      options = optionsText
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
      if (options.length < 2) {
        setError('Il faut au moins deux options, séparées par des virgules.')
        return
      }
      if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) {
        setError('Les options doivent être uniques.')
        return
      }
    }
    setError(null)
    onCreate({ label: cleanLabel, type, options })
    setLabel('')
    setType('text')
    setOptionsText('')
  }

  function onEnter(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="preset-creator">
      <input
        className="input"
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={onEnter}
        placeholder="Intitulé du champ (ex. Profession)"
        aria-label="Intitulé du raccourci"
      />
      <div className="seg trio" role="group" aria-label="Type de réponse du raccourci">
        {TYPE_CHOICES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={type === t.id ? 'seg-btn compact active' : 'seg-btn compact'}
            aria-pressed={type === t.id}
            onClick={() => setType(t.id)}
            title={t.hint}
          >
            <span className="seg-name">{TYPE_LABELS[t.id]}</span>
          </button>
        ))}
      </div>
      {type !== 'text' && (
        <input
          className="input"
          type="text"
          value={optionsText}
          onChange={(e) => setOptionsText(e.target.value)}
          onKeyDown={onEnter}
          placeholder="Options séparées par des virgules (min. 2)"
          aria-label="Options du raccourci"
        />
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn primary" onClick={submit}>
        Créer le raccourci
      </button>
    </div>
  )
}

function QuestionForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: Question
  submitLabel: string
  onSubmit: (values: QuestionValues) => void
  onCancel?: () => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [type, setType] = useState<QuestionType>(initial?.type ?? 'text')
  const [section, setSection] = useState<QuestionSection>(initial?.section ?? 'survey')
  const [options, setOptions] = useState<string[]>(
    initial && initial.options.length > 0 ? [...initial.options] : ['', ''],
  )
  const [required, setRequired] = useState(initial?.required ?? false)
  const [error, setError] = useState<string | null>(null)

  const needsOptions = isChoiceType(type)

  function setOption(index: number, value: string) {
    setOptions((prev) => prev.map((o, i) => (i === index ? value : o)))
  }

  function addOption() {
    setOptions((prev) => [...prev, ''])
  }

  function removeOption(index: number) {
    setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const cleanLabel = label.trim()
    if (!cleanLabel) {
      setError('L’intitulé de la question est obligatoire.')
      return
    }
    const cleanOptions = needsOptions
      ? options.map((o) => o.trim()).filter(Boolean)
      : []
    if (needsOptions) {
      if (cleanOptions.length < 2) {
        setError('Il faut au moins deux options non vides.')
        return
      }
      if (new Set(cleanOptions).size !== cleanOptions.length) {
        setError('Les options doivent être uniques.')
        return
      }
    }
    setError(null)
    onSubmit({ label: cleanLabel, type, section, options: cleanOptions, required })
    if (!initial) {
      // On garde la section choisie pour enchaîner les ajouts dans la même partie.
      setLabel('')
      setType('text')
      setOptions(['', ''])
      setRequired(false)
    }
  }

  return (
    <form className="q-form" onSubmit={handleSubmit}>
      <label className="field">
        <span className="field-label">Question</span>
        <input
          className="input"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex. Quel est votre âge ?"
        />
      </label>

      <div className="field">
        <span className="field-label">Section</span>
        <div className="seg duo" role="group" aria-label="Section du formulaire">
          {SECTION_CHOICES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? 'seg-btn compact active' : 'seg-btn compact'}
              aria-pressed={section === s.id}
              onClick={() => setSection(s.id)}
            >
              <span className="seg-name">{SECTION_LABELS[s.id]}</span>
            </button>
          ))}
        </div>
        <p className="seg-explain">
          {SECTION_CHOICES.find((s) => s.id === section)?.hint}
        </p>
      </div>

      <div className="field">
        <span className="field-label">Type de réponse</span>
        <div className="seg" role="group" aria-label="Type de réponse">
          {TYPE_CHOICES.map((t) => (
            <button
              key={t.id}
              type="button"
              className={type === t.id ? 'seg-btn active' : 'seg-btn'}
              aria-pressed={type === t.id}
              onClick={() => setType(t.id)}
            >
              <span className="seg-glyph" aria-hidden="true">
                {t.glyph}
              </span>
              <span className="seg-text">
                <span className="seg-name">{TYPE_LABELS[t.id]}</span>
                <span className="seg-hint">{t.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </div>

      {needsOptions && (
        <div className="field">
          <span className="field-label">Options proposées</span>
          <div className="options-editor">
            {options.map((o, i) => (
              <div key={i} className="option-row">
                <input
                  className="input"
                  type="text"
                  value={o}
                  onChange={(e) => setOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  aria-label={`Option ${i + 1}`}
                />
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => removeOption(i)}
                  disabled={options.length <= 2}
                  aria-label={`Supprimer l’option ${i + 1}`}
                >
                  ×
                </button>
              </div>
            ))}
            <button type="button" className="btn ghost sm" onClick={addOption}>
              + Ajouter une option
            </button>
          </div>
        </div>
      )}

      <label className="check-line">
        <input
          type="checkbox"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
        />
        <span>Réponse obligatoire</span>
      </label>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-actions">
        <button type="submit" className="btn primary">
          {submitLabel}
        </button>
        {onCancel && (
          <button type="button" className="btn ghost" onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </form>
  )
}

export default function BuilderPage({
  questions,
  submissions,
  updateQuestions,
  notify,
  confirmAction,
}: {
  questions: Question[]
  submissions: Submission[]
  updateQuestions: (updater: (current: Question[]) => Question[]) => boolean
  notify: (message: string) => void
  confirmAction: ConfirmFn
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [customPresets, setCustomPresets] = useState<IdentityPreset[]>(loadPresets)
  const [creatingPreset, setCreatingPreset] = useState(false)

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === PRESETS_KEY) setCustomPresets(loadPresets())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const identity = useMemo(
    () => questions.filter((q) => q.section === 'identity'),
    [questions],
  )
  const survey = useMemo(
    () => questions.filter((q) => q.section === 'survey'),
    [questions],
  )

  const answeredCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of submissions) {
      for (const q of questions) {
        const v = s.answers[q.id]
        const has = Array.isArray(v) ? v.length > 0 : typeof v === 'string' && v.trim() !== ''
        if (has) map.set(q.id, (map.get(q.id) ?? 0) + 1)
      }
    }
    return map
  }, [questions, submissions])

  function addQuestion(values: QuestionValues) {
    const question: Question = { id: uid(), createdAt: Date.now(), ...values }
    if (updateQuestions((current) => [...current, question])) {
      notify(
        values.section === 'identity'
          ? 'Champ ajouté à la fiche répondant'
          : 'Question ajoutée au questionnaire',
      )
    }
  }

  function handleCreatePreset(preset: IdentityPreset) {
    const next = [...customPresets, preset]
    setCustomPresets(next)
    const ok = savePresets(next)
    setCreatingPreset(false)
    notify(
      ok
        ? `Raccourci « ${preset.label} » créé`
        : '⚠ Stockage local indisponible : le raccourci sera perdu au rechargement.',
    )
  }

  async function removeCustomPreset(preset: IdentityPreset) {
    const ok = await confirmAction({
      title: 'Supprimer ce raccourci ?',
      message: `Le raccourci « ${preset.label} » sera retiré de l’ajout rapide.\n\nLes champs déjà ajoutés à la fiche répondant ne sont pas affectés.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const next = customPresets.filter((p) => p.label !== preset.label)
    setCustomPresets(next)
    const saved = savePresets(next)
    notify(
      saved
        ? 'Raccourci supprimé'
        : '⚠ Stockage local indisponible : la suppression ne survivra pas au rechargement.',
    )
  }

  function addPreset(preset: IdentityPreset) {
    const exists = questions.some(
      (q) =>
        q.section === 'identity' &&
        q.label.toLowerCase() === preset.label.toLowerCase(),
    )
    if (exists) {
      notify(`« ${preset.label} » est déjà dans la fiche répondant`)
      return
    }
    const question: Question = {
      id: uid(),
      createdAt: Date.now(),
      label: preset.label,
      type: preset.type,
      section: 'identity',
      options: [...preset.options],
      required: false,
    }
    if (updateQuestions((current) => [...current, question])) {
      notify(`Champ « ${preset.label} » ajouté à la fiche répondant`)
    }
  }

  async function saveEdit(id: string, values: QuestionValues) {
    const prev = questions.find((q) => q.id === id)
    if (!prev) return
    const n = answeredCounts.get(id) ?? 0

    if (prev.options.length > 0 && !isChoiceType(values.type)) {
      const detail =
        n > 0
          ? `\n\n${n > 1 ? `Les ${n} réponses déjà collectées ne seront plus ventilées` : 'La réponse déjà collectée ne sera plus ventilée'} par option dans le tableau de bord.`
          : ''
      const ok = await confirmAction({
        title: 'Supprimer les options ?',
        message: `Passer en « ${TYPE_LABELS[values.type]} » supprimera définitivement les ${prev.options.length} options existantes de cette question.${detail}`,
        confirmLabel: 'Continuer',
        danger: true,
      })
      if (!ok) return
    } else if (isChoiceType(values.type) && n > 0) {
      const orphaned = prev.options.filter((o) => !values.options.includes(o))
      if (orphaned.length > 0) {
        const plural = orphaned.length > 1
        const ok = await confirmAction({
          title: plural ? 'Options modifiées' : 'Option modifiée',
          message: `${plural ? 'Ces options ont été renommées ou supprimées' : 'Cette option a été renommée ou supprimée'} alors que des réponses existent déjà :\n— ${orphaned.join('\n— ')}\n\n${plural ? 'Les anciennes valeurs correspondantes seront regroupées' : 'L’ancienne valeur correspondante sera regroupée'} sous « Autres valeurs » dans le tableau de bord.`,
          confirmLabel: 'Continuer',
          danger: true,
        })
        if (!ok) return
      }
    }

    const saved = updateQuestions((current) =>
      current.map((q) => (q.id === id ? { ...q, ...values } : q)),
    )
    setEditingId(null)
    if (saved) notify('Question mise à jour')
  }

  async function removeQuestion(q: Question) {
    const n = answeredCounts.get(q.id) ?? 0
    const detail =
      n > 0
        ? `\n\n${n} réponse${n > 1 ? 's' : ''} déjà collectée${n > 1 ? 's' : ''} pour cette question ne ${n > 1 ? 'seront' : 'sera'} plus affichée${n > 1 ? 's' : ''} dans le tableau de bord.`
        : ''
    const ok = await confirmAction({
      title: 'Supprimer la question ?',
      message: `« ${q.label} »${detail}`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const saved = updateQuestions((current) => current.filter((x) => x.id !== q.id))
    if (editingId === q.id) setEditingId(null)
    if (saved) notify('Question supprimée')
  }

  function move(id: string, sectionIndex: number, sectionLength: number, dir: -1 | 1) {
    const target = sectionIndex + dir
    if (target < 0 || target >= sectionLength) return
    const ok = updateQuestions((current) => {
      const idx = current.findIndex((x) => x.id === id)
      if (idx < 0) return current
      const section = current[idx].section
      let j = idx + dir
      while (j >= 0 && j < current.length && current[j].section !== section) j += dir
      if (j < 0 || j >= current.length) return current
      const next = [...current]
      const tmp = next[idx]
      next[idx] = next[j]
      next[j] = tmp
      return next
    })
    if (ok) notify(`Question déplacée en position ${target + 1}`)
  }

  function renderCard(q: Question, i: number, list: Question[]) {
    return (
      <li key={q.id} className="card q-card">
        {editingId === q.id ? (
          <QuestionForm
            initial={q}
            submitLabel="Enregistrer"
            onSubmit={(v) => saveEdit(q.id, v)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <>
            <div className="q-card-head">
              <span className="q-index">{String(i + 1).padStart(2, '0')}</span>
              <span className={`type-badge t-${q.type}`}>
                <span className="dot" aria-hidden="true" />
                {TYPE_LABELS[q.type]}
              </span>
              {q.required && <span className="req-badge">obligatoire</span>}
              <span className="q-count">{answeredCounts.get(q.id) ?? 0} rép.</span>
            </div>
            <h3 className="q-label">{q.label}</h3>
            {q.options.length > 0 && (
              <ul className="chips">
                {q.options.map((o) => (
                  <li key={o} className="chip">
                    {o}
                  </li>
                ))}
              </ul>
            )}
            <div className="q-actions">
              <button
                className="icon-btn"
                onClick={() => move(q.id, i, list.length, -1)}
                aria-disabled={i === 0 || undefined}
                aria-label={`Monter « ${q.label} »`}
              >
                ↑
              </button>
              <button
                className="icon-btn"
                onClick={() => move(q.id, i, list.length, 1)}
                aria-disabled={i === list.length - 1 || undefined}
                aria-label={`Descendre « ${q.label} »`}
              >
                ↓
              </button>
              <button className="btn ghost sm" onClick={() => setEditingId(q.id)}>
                Modifier
              </button>
              <button className="btn danger sm" onClick={() => removeQuestion(q)}>
                Supprimer
              </button>
            </div>
          </>
        )}
      </li>
    )
  }

  return (
    <>
      <p className="kicker">01 — Construire</p>
      <h1 className="page-title">Composer le questionnaire</h1>
      <p className="page-lead">
        La <strong>fiche répondant</strong> recueille les infos de la personne
        interrogée avant ses réponses ; le <strong>questionnaire</strong> porte les
        questions de l’enquête. Chaque champ est facultatif par défaut — cochez
        « Réponse obligatoire » au besoin.
      </p>

      <div className="builder-grid">
        <aside className="builder-aside">
          <div className="card panel">
            <div className="panel-head">
              <h2 className="panel-title">Nouvelle question</h2>
            </div>
            <div className="panel-body">
              <QuestionForm submitLabel="Ajouter la question" onSubmit={addQuestion} />
              <div className="preset-block">
                <span className="field-label">Ajout rapide — fiche répondant</span>
                <div className="preset-row">
                  {IDENTITY_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className="preset-chip"
                      onClick={() => addPreset(p)}
                    >
                      + {p.label}
                    </button>
                  ))}
                  {customPresets.map((p) => (
                    <span key={p.label} className="preset-chip custom">
                      <button
                        type="button"
                        className="preset-add"
                        onClick={() => addPreset(p)}
                      >
                        + {p.label}
                      </button>
                      <button
                        type="button"
                        className="preset-del"
                        onClick={() => removeCustomPreset(p)}
                        aria-label={`Supprimer le raccourci « ${p.label} »`}
                        title="Supprimer ce raccourci"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    type="button"
                    className={
                      creatingPreset ? 'preset-chip new active' : 'preset-chip new'
                    }
                    onClick={() => setCreatingPreset(!creatingPreset)}
                    aria-expanded={creatingPreset}
                  >
                    {creatingPreset ? '× Fermer' : '＋ Créer un raccourci'}
                  </button>
                </div>
                {creatingPreset && (
                  <PresetCreator
                    existingLabels={[...IDENTITY_PRESETS, ...customPresets].map(
                      (p) => p.label,
                    )}
                    onCreate={handleCreatePreset}
                  />
                )}
              </div>
            </div>
          </div>
        </aside>

        <section aria-label="Questions du formulaire">
          <div className="list-section">
            <h2 className="section-title sm">
              Fiche répondant
              <span className="section-count">{identity.length}</span>
            </h2>
            {identity.length === 0 ? (
              <p className="section-hint">
                Aucun champ pour l’instant — utilisez l’ajout rapide ci-contre ou le
                formulaire avec la section « Fiche répondant ».
              </p>
            ) : (
              <ol className="q-list">{identity.map((q, i) => renderCard(q, i, identity))}</ol>
            )}
          </div>

          <div className="list-section">
            <h2 className="section-title sm">
              Questionnaire
              <span className="section-count">{survey.length}</span>
            </h2>
            {survey.length === 0 ? (
              <p className="section-hint">
                Aucune question pour l’instant — composez-en une avec le formulaire
                ci-contre (section « Questionnaire »).
              </p>
            ) : (
              <ol className="q-list">{survey.map((q, i) => renderCard(q, i, survey))}</ol>
            )}
          </div>
        </section>
      </div>
    </>
  )
}
