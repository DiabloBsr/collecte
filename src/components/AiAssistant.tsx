import { useState } from 'react'
import type { QuestionSection, QuestionType } from '../types'
import { TYPE_LABELS } from '../types'
import { getAccessToken } from '../cloud'
import { TypeIcon } from '../pages/Builder'

export interface AiQuestion {
  label: string
  type: QuestionType
  section: QuestionSection
  options: string[]
  required: boolean
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export default function AiAssistant({
  onAdd,
  notify,
}: {
  onAdd: (questions: AiQuestion[]) => void
  notify: (message: string) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState<AiQuestion[]>([])
  const [kept, setKept] = useState<Set<number>>(new Set())

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const token = await getAccessToken()
    if (!token) {
      notify('⚠ Connectez-vous pour utiliser l’assistant IA.')
      return
    }
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }]
    setMessages(nextMessages)
    setInput('')
    setBusy(true)
    try {
      const response = await fetch('/api/ai-form', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ messages: nextMessages }),
      })
      const data = (await response.json().catch(() => ({}))) as {
        reply?: string
        questions?: AiQuestion[]
        error?: string
      }
      if (!response.ok) {
        notify(`⚠ ${data.error ?? 'Assistant indisponible.'}`)
        setMessages(messages)
        return
      }
      const reply = data.reply || 'Voici ma proposition.'
      setMessages([...nextMessages, { role: 'assistant', content: reply }])
      const questions = Array.isArray(data.questions) ? data.questions : []
      if (questions.length > 0) {
        setProposal(questions)
        setKept(new Set(questions.map((_, i) => i)))
      }
    } catch {
      notify('⚠ Assistant injoignable — vérifiez la connexion.')
      setMessages(messages)
    } finally {
      setBusy(false)
    }
  }

  function toggle(i: number) {
    setKept((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  function addKept() {
    const selected = proposal.filter((_, i) => kept.has(i))
    if (selected.length === 0) return
    onAdd(selected)
    setProposal([])
    setKept(new Set())
  }

  return (
    <div className="card ai-card">
      <div className="panel-head ai-head">
        <h2 className="panel-title">✨ Créer avec l’IA</h2>
      </div>
      <div className="panel-body">
        {messages.length === 0 && (
          <p className="ai-hint">
            Décris ton enquête, l’assistant propose les questions avec les bons
            types — tu valides avant l’ajout. Ex. : « enquête sur l’accès à l’eau
            potable dans les fokontany ».
          </p>
        )}
        {messages.length > 0 && (
          <div className="ai-log">
            {messages.slice(-4).map((m, i) => (
              <p key={i} className={m.role === 'user' ? 'ai-msg me' : 'ai-msg'}>
                {m.content}
              </p>
            ))}
            {busy && <p className="ai-msg thinking">L’assistant réfléchit…</p>}
          </div>
        )}

        {proposal.length > 0 && (
          <div className="ai-proposal">
            <span className="field-label">Questions proposées</span>
            <ul className="ai-items">
              {proposal.map((q, i) => (
                <li key={i}>
                  <label className="ai-item">
                    <input
                      type="checkbox"
                      checked={kept.has(i)}
                      onChange={() => toggle(i)}
                    />
                    <span className="ai-item-body">
                      <span className="ai-item-label">{q.label}</span>
                      <span className="ai-item-meta">
                        <TypeIcon type={q.type} size={11} /> {TYPE_LABELS[q.type]}
                        {' · '}
                        {q.section === 'identity' ? 'Fiche répondant' : 'Questionnaire'}
                        {q.options.length > 0 && ` · ${q.options.join(' / ')}`}
                        {q.required && ' · obligatoire'}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            <button type="button" className="btn primary" onClick={addKept}>
              Ajouter {kept.size} question{kept.size > 1 ? 's' : ''}
            </button>
          </div>
        )}

        <div className="ai-input-row">
          <textarea
            className="input ai-input"
            rows={2}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void send()
              }
            }}
            placeholder={
              messages.length === 0
                ? 'Décris ton enquête…'
                : 'Précise ou demande des ajustements…'
            }
            aria-label="Message à l’assistant IA"
          />
          <button
            type="button"
            className="btn primary ai-send"
            onClick={() => void send()}
            disabled={busy || input.trim() === ''}
          >
            {busy ? '…' : 'Envoyer'}
          </button>
        </div>
      </div>
    </div>
  )
}
