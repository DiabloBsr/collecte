import { useState } from 'react'
import type { ConfirmFn, Questionnaire } from '../types'
import { uid } from '../storage'

export default function QuestionnaireBar({
  questionnaires,
  current,
  count,
  onSelect,
  updateQuestionnaires,
  notify,
  confirmAction,
}: {
  questionnaires: Questionnaire[]
  current: Questionnaire | null
  count: number
  onSelect: (id: string) => void
  updateQuestionnaires: (
    updater: (current: Questionnaire[]) => Questionnaire[],
  ) => boolean
  notify: (message: string) => void
  confirmAction: ConfirmFn
}) {
  const [mode, setMode] = useState<'closed' | 'edit' | 'new'>('closed')
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')

  function open(next: 'edit' | 'new') {
    if (mode === next) {
      setMode('closed')
      return
    }
    setMode(next)
    setName(next === 'edit' ? (current?.name ?? '') : '')
    setGoal(next === 'edit' && current?.goal ? String(current.goal) : '')
  }

  function submit() {
    const cleanName = name.trim()
    if (!cleanName) {
      notify('⚠ Le nom de l’enquête est obligatoire.')
      return
    }
    const parsed = goal.trim() === '' ? null : Math.round(Number(goal))
    const goalValue = parsed !== null && !Number.isNaN(parsed) && parsed > 0 ? parsed : null
    if (mode === 'new') {
      const questionnaire: Questionnaire = {
        id: uid(),
        name: cleanName,
        goal: goalValue,
        createdAt: Date.now(),
      }
      if (updateQuestionnaires((cur) => [...cur, questionnaire])) {
        onSelect(questionnaire.id)
        notify(`Enquête « ${cleanName} » créée`)
      }
    } else if (current) {
      const id = current.id
      if (
        updateQuestionnaires((cur) =>
          cur.map((x) => (x.id === id ? { ...x, name: cleanName, goal: goalValue } : x)),
        )
      ) {
        notify('Enquête mise à jour')
      }
    }
    setMode('closed')
  }

  async function remove() {
    if (!current || questionnaires.length <= 1) return
    const n = count
    const ok = await confirmAction({
      title: 'Supprimer cette enquête ?',
      message: `« ${current.name} » disparaîtra de l’application, avec ses questions et ${n > 0 ? `ses ${n} réponse${n > 1 ? 's' : ''}` : 'ses réponses'}.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const id = current.id
    const fallback = questionnaires.find((x) => x.id !== id)
    if (updateQuestionnaires((cur) => cur.filter((x) => x.id !== id))) {
      if (fallback) onSelect(fallback.id)
      notify('Enquête supprimée')
    }
    setMode('closed')
  }

  const pct =
    current?.goal && current.goal > 0
      ? Math.min(100, Math.round((count / current.goal) * 100))
      : null

  return (
    <div className="qn-bar">
      <div className="qn-bar-inner">
        <span className="qn-label">Enquête</span>
        <select
          className="q-select"
          value={current?.id ?? ''}
          onChange={(e) => onSelect(e.target.value)}
          aria-label="Enquête active"
        >
          {questionnaires.map((qn) => (
            <option key={qn.id} value={qn.id}>
              {qn.name}
            </option>
          ))}
        </select>
        {pct !== null && current?.goal && (
          <span className="qn-goal" title={`Objectif : ${current.goal} réponses`}>
            <span className="qn-goal-track" aria-hidden="true">
              <span className="qn-goal-fill" style={{ width: `${pct}%` }} />
            </span>
            {count}/{current.goal} · {pct} %
          </span>
        )}
        <span className="toolbar-spacer" />
        <button type="button" className="btn ghost sm" onClick={() => open('edit')}>
          Gérer
        </button>
        <button type="button" className="btn ghost sm" onClick={() => open('new')}>
          ＋ Nouvelle enquête
        </button>
      </div>
      {mode !== 'closed' && (
        <div className="card qn-form">
          <label className="field">
            <span className="field-label">Nom de l’enquête</span>
            <input
              className="input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex. Usage d’Internet — zone Nord"
            />
          </label>
          <label className="field">
            <span className="field-label">Objectif de réponses (optionnel)</span>
            <input
              className="input"
              type="number"
              min="1"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Ex. 300"
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn primary" onClick={submit}>
              {mode === 'new' ? 'Créer l’enquête' : 'Enregistrer'}
            </button>
            <button type="button" className="btn ghost" onClick={() => setMode('closed')}>
              Annuler
            </button>
            {mode === 'edit' && questionnaires.length > 1 && (
              <button type="button" className="btn danger" onClick={() => void remove()}>
                Supprimer l’enquête
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
