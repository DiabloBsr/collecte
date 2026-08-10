import { useMemo, useState } from 'react'
import type { AnswerValue, ConfirmFn, Question, Submission } from '../types'
import { TYPE_LABELS } from '../types'

const dateFmt = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function hasAnswer(v: AnswerValue | undefined): boolean {
  if (v === undefined) return false
  return Array.isArray(v) ? v.length > 0 : v.trim() !== ''
}

function formatValue(v: AnswerValue | undefined): string {
  if (v === undefined) return '—'
  if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : '—'
  return v.trim() === '' ? '—' : v
}

function ChoiceStats({ q, submissions }: { q: Question; submissions: Submission[] }) {
  const { rows, answered } = useMemo(() => {
    const counts = new Map<string, number>(q.options.map((o) => [o, 0]))
    let other = 0
    let answeredCount = 0
    for (const s of submissions) {
      const v = s.answers[q.id]
      if (!hasAnswer(v)) continue
      answeredCount++
      const values = Array.isArray(v) ? v : [v as string]
      for (const val of values) {
        if (counts.has(val)) counts.set(val, (counts.get(val) ?? 0) + 1)
        else other++
      }
    }
    const result = q.options.map((o) => ({ label: o, count: counts.get(o) ?? 0 }))
    if (other > 0) result.push({ label: 'Autres valeurs', count: other })
    return { rows: result, answered: answeredCount }
  }, [q, submissions])

  const max = Math.max(1, ...rows.map((r) => r.count))

  return (
    <div className="bars">
      {rows.map((r) => {
        const pct = answered > 0 ? Math.round((r.count / answered) * 100) : 0
        return (
          <div
            key={r.label}
            className="bar-row"
            title={`${r.label} : ${r.count} (${pct} %)`}
          >
            <span className="bar-label">{r.label}</span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </span>
            <span className="bar-value">
              {r.count}
              <span className="bar-pct"> · {pct} %</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

function NumberHistogram({ values }: { values: number[] }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min
  let bins: { label: string; count: number }[]
  if (range <= 12 && values.every((n) => Number.isInteger(n))) {
    // Une colonne par valeur entière (parfait pour nb d'enfants, notes…)
    bins = []
    for (let v = min; v <= max; v++) {
      bins.push({ label: String(v), count: values.filter((x) => x === v).length })
    }
  } else {
    // Étendue large (âges…) : 8 tranches égales
    const n = 8
    const step = range / n || 1
    bins = Array.from({ length: n }, (_, i) => {
      const lo = min + i * step
      const hi = i === n - 1 ? max : min + (i + 1) * step
      return {
        label: `${Math.round(lo)}–${Math.round(hi)}`,
        count: values.filter(
          (x) => x >= lo && (i === n - 1 ? x <= hi : x < hi),
        ).length,
      }
    })
  }
  const peak = Math.max(1, ...bins.map((b) => b.count))
  return (
    <div className="histo">
      {bins.map((b) => (
        <div key={b.label} className="histo-col">
          <span className="histo-count">{b.count > 0 ? b.count : ''}</span>
          <div
            className={b.count > 0 ? 'histo-bar' : 'histo-bar zero'}
            style={{ height: `${Math.max((b.count / peak) * 100, 2)}%` }}
          />
          <span className="histo-label">{b.label}</span>
        </div>
      ))}
    </div>
  )
}

function TimelineChart({ submissions }: { submissions: Submission[] }) {
  const DAYS = 14
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const buckets = Array.from({ length: DAYS }, (_, i) => ({
    date: new Date(today.getTime() - (DAYS - 1 - i) * 86400000),
    count: 0,
  }))
  for (const s of submissions) {
    const d = new Date(s.submittedAt)
    d.setHours(0, 0, 0, 0)
    const idx = Math.round((d.getTime() - buckets[0].date.getTime()) / 86400000)
    if (idx >= 0 && idx < DAYS) buckets[idx].count++
  }
  const peak = Math.max(1, ...buckets.map((b) => b.count))
  const W = 560
  const H = 120
  const PAD = 8
  const x = (i: number) => PAD + (i * (W - 2 * PAD)) / (DAYS - 1)
  const y = (c: number) => H - PAD - (c * (H - 2 * PAD - 14)) / peak
  const points = buckets.map((b, i) => `${x(i)},${y(b.count)}`).join(' ')
  const area = `${PAD},${H - PAD} ${points} ${W - PAD},${H - PAD}`
  const dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' })
  return (
    <div className="card chart-card">
      <div className="qstat-head">
        <h3 className="qstat-title">Réponses par jour</h3>
        <span className="qstat-meta">14 derniers jours</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="timeline-svg"
        role="img"
        aria-label="Nombre de réponses collectées par jour sur les 14 derniers jours"
      >
        <polygon points={area} fill="rgba(179, 68, 26, 0.12)" />
        <polyline
          points={points}
          fill="none"
          stroke="#b3441a"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {buckets.map(
          (b, i) =>
            b.count > 0 && (
              <g key={b.date.getTime()}>
                <circle
                  cx={x(i)}
                  cy={y(b.count)}
                  r="3.5"
                  fill="#8a3312"
                  stroke="#fdfaf2"
                  strokeWidth="1.5"
                />
                <text x={x(i)} y={y(b.count) - 8} textAnchor="middle" className="timeline-val">
                  {b.count}
                </text>
              </g>
            ),
        )}
      </svg>
      <div className="timeline-axis" aria-hidden="true">
        <span>{dayFmt.format(buckets[0].date)}</span>
        <span>{dayFmt.format(buckets[DAYS - 1].date)}</span>
      </div>
    </div>
  )
}

function NumberStats({ q, submissions }: { q: Question; submissions: Submission[] }) {
  const values = submissions
    .map((s) => s.answers[q.id])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map(Number)
    .filter((n) => !Number.isNaN(n))
  if (values.length === 0) {
    return <p className="qstat-empty">Aucune réponse pour cette question.</p>
  }
  const avg = values.reduce((a, b) => a + b, 0) / values.length
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  return (
    <>
      <div className="number-tiles">
        <div className="number-tile">
          <span className="num-val">{fmt(avg)}</span>
          <span className="num-label">moyenne</span>
        </div>
        <div className="number-tile">
          <span className="num-val">{fmt(Math.min(...values))}</span>
          <span className="num-label">min</span>
        </div>
        <div className="number-tile">
          <span className="num-val">{fmt(Math.max(...values))}</span>
          <span className="num-label">max</span>
        </div>
        <div className="number-tile">
          <span className="num-val">{values.length}</span>
          <span className="num-label">réponses</span>
        </div>
      </div>
      {values.length >= 2 && <NumberHistogram values={values} />}
    </>
  )
}

function TextAnswers({ q, submissions }: { q: Question; submissions: Submission[] }) {
  const [expanded, setExpanded] = useState(false)

  const items = useMemo(
    () =>
      submissions
        .filter((s) => hasAnswer(s.answers[q.id]))
        .map((s) => ({ id: s.id, date: s.submittedAt, value: s.answers[q.id] }))
        .reverse(),
    [q, submissions],
  )

  if (items.length === 0) {
    return <p className="qstat-empty">Aucune réponse pour cette question.</p>
  }

  const shown = expanded ? items : items.slice(0, 6)

  return (
    <>
      <ul className="answers-list">
        {shown.map((it) => (
          <li key={it.id} className="answer-item">
            <span className="answer-text">« {formatValue(it.value)} »</span>
            <span className="answer-date">{dateFmt.format(it.date)}</span>
          </li>
        ))}
      </ul>
      {items.length > 6 && (
        <button className="btn ghost sm" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Réduire' : `Afficher les ${items.length - 6} autres`}
        </button>
      )}
    </>
  )
}

export default function DashboardPage({
  questions,
  submissions,
  updateSubmissions,
  notify,
  confirmAction,
}: {
  questions: Question[]
  submissions: Submission[]
  updateSubmissions: (updater: (current: Submission[]) => Submission[]) => boolean
  notify: (message: string) => void
  confirmAction: ConfirmFn
}) {
  const last = submissions.length > 0 ? submissions[submissions.length - 1] : null
  const latestFirst = useMemo(() => [...submissions].reverse(), [submissions])

  const identity = useMemo(
    () => questions.filter((q) => q.section === 'identity'),
    [questions],
  )
  const survey = useMemo(
    () => questions.filter((q) => q.section === 'survey'),
    [questions],
  )
  const ordered = useMemo(() => [...identity, ...survey], [identity, survey])
  // Statistiques de la fiche : uniquement les champs ANALYSABLES (nombres,
  // choix). Nom/prénom/téléphone identifient — ils restent dans la table
  // brute et les exports, pas dans les graphiques.
  const identityStats = useMemo(
    () => identity.filter((q) => q.type !== 'text'),
    [identity],
  )

  async function removeSubmission(s: Submission) {
    const ok = await confirmAction({
      title: 'Supprimer cette réponse ?',
      message: `La réponse du ${dateFmt.format(s.submittedAt)} sera définitivement supprimée.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    if (updateSubmissions((current) => current.filter((x) => x.id !== s.id))) {
      notify('Réponse supprimée')
    }
  }

  async function clearAll() {
    const n = submissions.length
    const ok = await confirmAction({
      title: 'Tout effacer ?',
      message: `${n > 1 ? `Les ${n} réponses collectées seront définitivement supprimées` : 'La réponse collectée sera définitivement supprimée'}.\n\nLes questions seront conservées, seules les données saisies seront perdues.`,
      confirmLabel: 'Tout effacer',
      danger: true,
    })
    if (!ok) return
    if (updateSubmissions(() => [])) {
      notify('Toutes les réponses ont été supprimées')
    }
  }

  function download(name: string, content: BlobPart, type: string) {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const stamp = new Date().toISOString().slice(0, 10)

  function renderQstat(q: Question, index: number | null) {
    const answered = submissions.filter((s) => hasAnswer(s.answers[q.id])).length
    return (
      <section key={q.id} className="card qstat" aria-label={q.label}>
        <div className="qstat-head">
          {index !== null && (
            <span className="q-index">{String(index + 1).padStart(2, '0')}</span>
          )}
          <h3 className="qstat-title">{q.label}</h3>
          <span className="qstat-meta">
            {TYPE_LABELS[q.type]} · {answered}/{submissions.length} rép.
          </span>
        </div>
        {q.type === 'text' ? (
          <TextAnswers q={q} submissions={submissions} />
        ) : q.type === 'number' ? (
          <NumberStats q={q} submissions={submissions} />
        ) : (
          <ChoiceStats q={q} submissions={submissions} />
        )}
      </section>
    )
  }

  function exportJson() {
    download(
      `collecte-${stamp}.json`,
      JSON.stringify(
        { exportedAt: new Date().toISOString(), questions: ordered, submissions },
        null,
        2,
      ),
      'application/json',
    )
    notify('Export JSON téléchargé')
  }

  function columnWidth(q: Question): number {
    let w = q.label.length
    for (const s of submissions) {
      const v = s.answers[q.id]
      const len =
        v === undefined ? 0 : Array.isArray(v) ? v.join(', ').length : v.length
      if (len > w) w = len
    }
    return Math.max(12, Math.min(42, w + 2))
  }

  async function exportXlsx() {
    try {
      await buildAndDownloadXlsx()
      notify('Export Excel téléchargé')
    } catch {
      notify('⚠ Export Excel impossible — vérifiez la connexion puis réessayez.')
    }
  }

  async function buildAndDownloadXlsx() {
    const mod = await import('exceljs')
    const Workbook =
      mod.Workbook ?? (mod as unknown as { default: typeof mod }).default.Workbook
    const wb = new Workbook()

    const hasGroups = identity.length > 0 && survey.length > 0
    const headerRowIdx = hasGroups ? 2 : 1
    const totalCols = 1 + ordered.length

    const ws = wb.addWorksheet('Réponses', {
      views: [{ state: 'frozen', ySplit: headerRowIdx }],
    })

    // Mapping STRICT en-tête ↔ donnée : chaque colonne est identifiée par l'id
    // de sa question, chaque cellule est écrite par cette clé — jamais par
    // position. Une réponse antérieure à l'ajout d'un champ = cellule vide.
    ws.columns = [
      { key: 'date', width: 19 },
      ...ordered.map((q) => ({ key: q.id, width: columnWidth(q) })),
    ]

    const INK = 'FF221A10'
    const CREAM = 'FFEFE7D4'
    const OLIVE = 'FF5B6C1F'
    const TERRA = 'FF8A3312'
    const ACCENT = 'FFB3441A'
    const LINE = 'FFE0D5BF'
    const ZEBRA = 'FFF8F3E7'
    const WHITE = 'FFFFF7EE'

    const solid = (argb: string) => ({
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb },
    })
    const thin = { style: 'thin' as const, color: { argb: LINE } }
    const allBorders = { top: thin, left: thin, bottom: thin, right: thin }

    if (hasGroups) {
      ws.getCell(1, 1).value = 'Date'
      ws.getCell(1, 2).value = 'Fiche répondant'
      ws.getCell(1, 2 + identity.length).value = 'Questionnaire'
      ws.mergeCells(1, 1, 2, 1)
      if (identity.length > 1) ws.mergeCells(1, 2, 1, 1 + identity.length)
      if (survey.length > 1)
        ws.mergeCells(1, 2 + identity.length, 1, 1 + identity.length + survey.length)
      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(1, c)
        const fill = c === 1 ? INK : c <= 1 + identity.length ? OLIVE : TERRA
        cell.fill = solid(fill)
        cell.font = { bold: true, color: { argb: WHITE }, size: 11 }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        cell.border = allBorders
      }
      ws.getRow(1).height = 22
    }

    const headerRow = ws.getRow(headerRowIdx)
    if (!hasGroups) headerRow.getCell(1).value = 'Date'
    ordered.forEach((q, i) => {
      headerRow.getCell(2 + i).value = q.label
    })
    for (let c = 1; c <= totalCols; c++) {
      const cell = headerRow.getCell(c)
      if (hasGroups) {
        if (c > 1) {
          cell.fill = solid(CREAM)
          cell.font = { bold: true, color: { argb: INK }, size: 11 }
        }
      } else {
        cell.fill = solid(ACCENT)
        cell.font = { bold: true, color: { argb: WHITE }, size: 11 }
      }
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      cell.border = allBorders
    }
    headerRow.height = 26
    ws.autoFilter = {
      from: { row: headerRowIdx, column: 1 },
      to: { row: headerRowIdx, column: totalCols },
    }

    submissions.forEach((s, i) => {
      // exceljs écrit les Date en UTC : on décale du fuseau local pour que la
      // cellule affichée dans Excel corresponde à l'heure locale de saisie.
      const shifted = new Date(
        s.submittedAt - new Date(s.submittedAt).getTimezoneOffset() * 60000,
      )
      const values: Record<string, Date | string | number> = { date: shifted }
      for (const q of ordered) {
        const v = s.answers[q.id]
        if (v === undefined) values[q.id] = ''
        else if (Array.isArray(v)) values[q.id] = v.join(', ')
        else if (q.type === 'number' && v.trim() !== '' && !Number.isNaN(Number(v)))
          values[q.id] = Number(v) // vraie cellule numérique, triable dans Excel
        else values[q.id] = v
      }
      const row = ws.addRow(values)
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = allBorders
        if (i % 2 === 1) cell.fill = solid(ZEBRA)
        cell.alignment = { vertical: 'top', horizontal: 'left' }
      })
      row.getCell(1).numFmt = 'dd/mm/yyyy hh:mm'
    })

    const buffer = (await wb.xlsx.writeBuffer()) as unknown as ArrayBuffer
    download(
      `collecte-${stamp}.xlsx`,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
  }

  function csvCell(s: string): string {
    // Neutralise l'injection de formule tableur (=, +, -, @, tab) avant le quoting.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }

  function exportCsv() {
    const header = ['Date', ...ordered.map((q) => q.label)]
    const lines = [header.map(csvCell).join(';')]
    for (const s of submissions) {
      const row = [
        dateFmt.format(s.submittedAt),
        ...ordered.map((q) => {
          const v = s.answers[q.id]
          if (v === undefined) return ''
          return Array.isArray(v) ? v.join(' | ') : v
        }),
      ]
      lines.push(row.map(csvCell).join(';'))
    }
    download(
      `collecte-${stamp}.csv`,
      String.fromCharCode(0xfeff) + lines.join('\r\n'),
      'text/csv;charset=utf-8',
    )
    notify('Export CSV téléchargé')
  }

  return (
    <>
      <p className="kicker">03 — Analyser</p>
      <h1 className="page-title">Tableau de bord</h1>
      <p className="page-lead">
        Vue globale des données collectées : distribution des réponses par question
        et données brutes exportables.
      </p>

      <div className="stats">
        <div className="stat">
          <span className="stat-value">{questions.length}</span>
          <span className="stat-label">Questions</span>
        </div>
        <div className="stat accent">
          <span className="stat-value">{submissions.length}</span>
          <span className="stat-label">Réponses collectées</span>
        </div>
        <div className="stat">
          <span className="stat-value stat-date">
            {last ? dateFmt.format(last.submittedAt) : '—'}
          </span>
          <span className="stat-label">Dernière réponse</span>
        </div>
      </div>

      {submissions.length === 0 ? (
        <div className="empty">
          <p className="empty-title">Aucune donnée pour l’instant.</p>
          <p className="empty-text">
            {questions.length === 0
              ? 'Composez d’abord votre questionnaire, puis collectez vos premières réponses.'
              : 'Le questionnaire est prêt — il ne reste qu’à collecter les premières réponses.'}
          </p>
          <a
            className="btn primary"
            href={questions.length === 0 ? '#/questions' : '#/formulaire'}
          >
            {questions.length === 0 ? 'Composer le questionnaire' : 'Saisir une réponse'}
          </a>
        </div>
      ) : (
        <>
          <div className="toolbar">
            <button className="btn ghost" onClick={() => void exportXlsx()}>
              Exporter en Excel
            </button>
            <button className="btn ghost" onClick={exportCsv}>
              Exporter en CSV
            </button>
            <button className="btn ghost" onClick={exportJson}>
              Exporter en JSON
            </button>
            <span className="toolbar-spacer" />
            <button className="btn danger" onClick={clearAll}>
              Tout effacer
            </button>
          </div>

          <TimelineChart submissions={submissions} />

          {identityStats.length > 0 && (
            <>
              <h2 className="section-title">Profil des répondants</h2>
              <div className="qstats">
                {identityStats.map((q) => renderQstat(q, null))}
              </div>
            </>
          )}

          {survey.length > 0 && (
            <>
              <h2 className="section-title">
                {identityStats.length > 0 ? 'Questionnaire' : 'Par question'}
              </h2>
              <div className="qstats">{survey.map((q, i) => renderQstat(q, i))}</div>
            </>
          )}

          <h2 className="section-title">Données brutes</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  {ordered.map((q) => (
                    <th key={q.id} scope="col" title={q.label}>
                      {q.label}
                    </th>
                  ))}
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {latestFirst.map((s) => (
                  <tr key={s.id}>
                    <td className="td-date">{dateFmt.format(s.submittedAt)}</td>
                    {ordered.map((q) => {
                      const text = formatValue(s.answers[q.id])
                      return (
                        <td key={q.id} title={text}>
                          {text}
                        </td>
                      )
                    })}
                    <td className="td-actions">
                      <button
                        className="icon-btn"
                        onClick={() => removeSubmission(s)}
                        aria-label={`Supprimer la réponse du ${dateFmt.format(s.submittedAt)}`}
                        title="Supprimer cette réponse"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  )
}
