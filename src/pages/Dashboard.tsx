import { useMemo, useState } from 'react'
import type {
  AnswerValue,
  ConfirmFn,
  Question,
  Questionnaire,
  Submission,
} from '../types'
import { TYPE_LABELS, isChoiceType } from '../types'

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

function collectorLabel(s: Submission): string {
  return s.collectorName || s.collectorEmail || '(non signé)'
}

function matchesOption(v: AnswerValue | undefined, option: string): boolean {
  return Array.isArray(v) ? v.includes(option) : v === option
}

interface Insight {
  strength: number
  text: string
}

/** Croise automatiquement les questions analysables et retient les écarts marquants. */
function computeInsights(questions: Question[], submissions: Submission[]): Insight[] {
  const MIN_GROUP = 5
  const insights: Insight[] = []
  const choice = questions.filter((q) => isChoiceType(q.type))
  const numeric = questions.filter((q) => q.type === 'number')

  for (const qa of choice) {
    for (const qb of choice) {
      if (qa.id === qb.id) continue
      const total = submissions.filter((s) => hasAnswer(s.answers[qb.id])).length
      if (total < MIN_GROUP * 2) continue
      for (const optA of qa.options) {
        const group = submissions.filter(
          (s) => matchesOption(s.answers[qa.id], optA) && hasAnswer(s.answers[qb.id]),
        )
        if (group.length < MIN_GROUP) continue
        for (const optB of qb.options) {
          const inGroup =
            group.filter((s) => matchesOption(s.answers[qb.id], optB)).length /
            group.length
          const overall =
            submissions.filter((s) => matchesOption(s.answers[qb.id], optB)).length /
            total
          const diff = (inGroup - overall) * 100
          if (Math.abs(diff) >= 15) {
            insights.push({
              strength: Math.abs(diff),
              text: `${Math.round(inGroup * 100)} % des « ${optA} » (${qa.label}) répondent « ${optB} » à « ${qb.label} », contre ${Math.round(overall * 100)} % dans l’ensemble (${diff > 0 ? '+' : ''}${Math.round(diff)} pts).`,
            })
          }
        }
      }
    }
  }

  for (const qn of numeric) {
    const numOf = (s: Submission) => {
      const v = s.answers[qn.id]
      return typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))
        ? Number(v)
        : null
    }
    const all = submissions.map(numOf).filter((n): n is number => n !== null)
    if (all.length < MIN_GROUP * 2) continue
    const avgAll = all.reduce((a, b) => a + b, 0) / all.length
    for (const qc of choice) {
      for (const opt of qc.options) {
        const grp = submissions
          .filter((s) => matchesOption(s.answers[qc.id], opt))
          .map(numOf)
          .filter((n): n is number => n !== null)
        if (grp.length < MIN_GROUP) continue
        const avgGrp = grp.reduce((a, b) => a + b, 0) / grp.length
        const rel = avgAll !== 0 ? ((avgGrp - avgAll) / Math.abs(avgAll)) * 100 : 0
        if (Math.abs(rel) >= 20) {
          insights.push({
            strength: Math.abs(rel),
            text: `« ${qn.label} » moyen des « ${opt} » (${qc.label}) : ${avgGrp.toFixed(1)}, contre ${avgAll.toFixed(1)} pour l’ensemble (${rel > 0 ? '+' : ''}${Math.round(rel)} %).`,
          })
        }
      }
    }
  }

  const seen = new Set<string>()
  return insights
    .sort((a, b) => b.strength - a.strength)
    .filter((i) => {
      if (seen.has(i.text)) return false
      seen.add(i.text)
      return true
    })
    .slice(0, 6)
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

function GeoScatter({ points }: { points: Submission[] }) {
  const W = 560
  const H = 260
  const P = 26
  const lats = points.map((p) => p.lat as number)
  const lngs = points.map((p) => p.lng as number)
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  const x = (lng: number) =>
    maxLng === minLng ? W / 2 : P + ((lng - minLng) / (maxLng - minLng)) * (W - 2 * P)
  const y = (lat: number) =>
    maxLat === minLat ? H / 2 : H - P - ((lat - minLat) / (maxLat - minLat)) * (H - 2 * P)
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="geo-svg"
      role="img"
      aria-label="Répartition géographique des entretiens"
    >
      <rect x="0" y="0" width={W} height={H} rx="10" fill="#efe7d4" />
      {points.map((p) => (
        <circle
          key={p.id}
          cx={x(p.lng as number)}
          cy={y(p.lat as number)}
          r="5"
          fill="#b3441a"
          fillOpacity="0.75"
          stroke="#fdfaf2"
          strokeWidth="1.5"
        />
      ))}
    </svg>
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
  questionnaire,
  questions,
  submissions,
  updateSubmissions,
  notify,
  confirmAction,
}: {
  questionnaire: Questionnaire | null
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

  const insights = useMemo(
    () => computeInsights([...identityStats, ...survey], submissions),
    [identityStats, survey, submissions],
  )

  const team = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of submissions) {
      const who = collectorLabel(s)
      map.set(who, (map.get(who) ?? 0) + 1)
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1])
  }, [submissions])

  const located = useMemo(
    () =>
      submissions.filter(
        (s) => typeof s.lat === 'number' && typeof s.lng === 'number',
      ),
    [submissions],
  )

  const goalPct =
    questionnaire?.goal && questionnaire.goal > 0
      ? Math.min(100, Math.round((submissions.length / questionnaire.goal) * 100))
      : null

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
    const EXTRA = ['Enquêteur', 'Latitude', 'Longitude']
    const totalCols = 1 + ordered.length + EXTRA.length

    const ws = wb.addWorksheet('Réponses', {
      views: [{ state: 'frozen', ySplit: headerRowIdx }],
    })

    // Mapping STRICT en-tête ↔ donnée : chaque colonne est identifiée par l'id
    // de sa question, chaque cellule est écrite par cette clé — jamais par
    // position. Une réponse antérieure à l'ajout d'un champ = cellule vide.
    ws.columns = [
      { key: 'date', width: 19 },
      ...ordered.map((q) => ({ key: q.id, width: columnWidth(q) })),
      { key: 'collector', width: 24 },
      { key: 'lat', width: 12 },
      { key: 'lng', width: 12 },
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
      EXTRA.forEach((label, i) => {
        ws.getCell(1, 2 + ordered.length + i).value = label
        ws.mergeCells(1, 2 + ordered.length + i, 2, 2 + ordered.length + i)
      })
      ws.mergeCells(1, 1, 2, 1)
      if (identity.length > 1) ws.mergeCells(1, 2, 1, 1 + identity.length)
      if (survey.length > 1)
        ws.mergeCells(1, 2 + identity.length, 1, 1 + identity.length + survey.length)
      for (let c = 1; c <= totalCols; c++) {
        const cell = ws.getCell(1, c)
        const fill =
          c === 1 || c > 1 + ordered.length
            ? INK
            : c <= 1 + identity.length
              ? OLIVE
              : TERRA
        cell.fill = solid(fill)
        cell.font = { bold: true, color: { argb: WHITE }, size: 11 }
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
        cell.border = allBorders
      }
      ws.getRow(1).height = 22
    }

    const headerRow = ws.getRow(headerRowIdx)
    if (!hasGroups) {
      headerRow.getCell(1).value = 'Date'
      EXTRA.forEach((label, i) => {
        headerRow.getCell(2 + ordered.length + i).value = label
      })
    }
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
      values.collector = collectorLabel(s)
      values.lat = s.lat !== undefined ? s.lat : ''
      values.lng = s.lng !== undefined ? s.lng : ''
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

  function buildReportHtml(): string {
    const name = questionnaire?.name ?? 'Enquête'
    const dates = submissions.map((s) => s.submittedAt)
    const period =
      submissions.length > 0
        ? `${dateFmt.format(Math.min(...dates))} → ${dateFmt.format(Math.max(...dates))}`
        : '—'
    const esc = (t: string) =>
      t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const analysable = [...identityStats, ...survey]
    let sections = ''
    for (const q of analysable) {
      if (isChoiceType(q.type)) {
        const answered = submissions.filter((s) => hasAnswer(s.answers[q.id])).length
        let rows = ''
        for (const opt of q.options) {
          const count = submissions.filter((s) =>
            matchesOption(s.answers[q.id], opt),
          ).length
          const pct = answered > 0 ? Math.round((count / answered) * 100) : 0
          rows += `<div class="r"><span class="rl">${esc(opt)}</span><span class="rt"><span class="rf" style="width:${pct}%"></span></span><span class="rv">${count} · ${pct} %</span></div>`
        }
        sections += `<section><h3>${esc(q.label)}</h3><p class="meta">${TYPE_LABELS[q.type]} · ${answered}/${submissions.length} réponses</p>${rows}</section>`
      } else if (q.type === 'number') {
        const values = submissions
          .map((s) => {
            const v = s.answers[q.id]
            return typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))
              ? Number(v)
              : null
          })
          .filter((n): n is number => n !== null)
        if (values.length === 0) continue
        const avg = values.reduce((a, b) => a + b, 0) / values.length
        sections += `<section><h3>${esc(q.label)}</h3><p class="meta">Nombre · ${values.length} réponses</p><p class="nums"><b>${avg.toFixed(1)}</b> moyenne · <b>${Math.min(...values)}</b> min · <b>${Math.max(...values)}</b> max</p></section>`
      }
    }
    const insightItems = insights.map((i) => `<li>${esc(i.text)}</li>`).join('')
    const teamRows = team
      .map(
        ([who, n]) =>
          `<div class="r"><span class="rl">${esc(who)}</span><span class="rv">${n} réponse${n > 1 ? 's' : ''}</span></div>`,
      )
      .join('')
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Rapport — ${esc(name)}</title><style>
body{font-family:Georgia,serif;background:#f5efe3;color:#221a10;margin:0;padding:40px 20px}
main{max-width:760px;margin:0 auto;background:#fdfaf2;border:1px solid #e0d5bf;border-radius:12px;padding:40px 44px}
h1{font-size:30px;margin:0 0 4px}h2{font-size:20px;border-bottom:1px solid #c8b998;padding-bottom:6px;margin:34px 0 14px}
h3{font-size:16px;margin:22px 0 2px}.k{color:#8a3312;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-family:monospace}
.meta{color:#6f6350;font-size:12px;font-family:monospace;margin:0 0 8px}.nums{font-size:15px}
.r{display:flex;align-items:center;gap:10px;margin:4px 0;font-size:13.5px}.rl{min-width:160px;color:#6f6350}
.rt{flex:1;height:12px;background:#efe7d4;border-radius:0 4px 4px 0;border-left:2px solid #c8b998;overflow:hidden}
.rf{display:block;height:100%;background:linear-gradient(90deg,#b3441a,#8a3312);border-radius:0 4px 4px 0}
.rv{font-family:monospace;font-size:12px;min-width:76px;text-align:right}
ul{padding-left:20px}li{margin:8px 0}
footer{margin-top:36px;color:#9c8d75;font-size:11px;font-family:monospace;text-align:center}
@media print{body{background:#fff;padding:0}main{border:none}}
</style></head><body><main>
<p class="k">Rapport d’enquête</p><h1>${esc(name)}</h1>
<p class="meta">Généré le ${dateFmt.format(Date.now())}</p>
<h2>Échantillon</h2>
<div class="r"><span class="rl">Réponses collectées</span><span class="rv">${submissions.length}</span></div>
<div class="r"><span class="rl">Période de collecte</span><span class="rv" style="min-width:auto">${period}</span></div>
${questionnaire?.goal ? `<div class="r"><span class="rl">Objectif</span><span class="rv">${submissions.length}/${questionnaire.goal} (${goalPct} %)</span></div>` : ''}
${located.length > 0 ? `<div class="r"><span class="rl">Entretiens géolocalisés</span><span class="rv">${located.length}</span></div>` : ''}
${teamRows ? `<h2>Équipe de collecte</h2>${teamRows}` : ''}
${insightItems ? `<h2>Ce qui ressort</h2><ul>${insightItems}</ul>` : ''}
<h2>Résultats par question</h2>${sections}
<footer>Généré par Collecte — Ctrl+P pour l’enregistrer en PDF</footer>
</main></body></html>`
  }

  function exportReport() {
    const slug = (questionnaire?.name ?? 'enquete')
      .toLowerCase()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
    download(
      `rapport-${slug}-${stamp}.html`,
      buildReportHtml(),
      'text/html;charset=utf-8',
    )
    notify('Rapport généré — ouvrez-le puis Ctrl+P pour un PDF')
  }

  function csvCell(s: string): string {
    // Neutralise l'injection de formule tableur (=, +, -, @, tab) avant le quoting.
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
    return /[";\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
  }

  function exportCsv() {
    const header = [
      'Date',
      'Enquêteur',
      ...ordered.map((q) => q.label),
      'Latitude',
      'Longitude',
    ]
    const lines = [header.map(csvCell).join(';')]
    for (const s of submissions) {
      const row = [
        dateFmt.format(s.submittedAt),
        collectorLabel(s),
        ...ordered.map((q) => {
          const v = s.answers[q.id]
          if (v === undefined) return ''
          return Array.isArray(v) ? v.join(' | ') : v
        }),
        s.lat !== undefined ? String(s.lat) : '',
        s.lng !== undefined ? String(s.lng) : '',
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
        {goalPct !== null && questionnaire?.goal && (
          <div className={goalPct >= 100 ? 'stat accent' : 'stat'}>
            <span className="stat-value">{goalPct} %</span>
            <span className="stat-label">
              Objectif · {submissions.length}/{questionnaire.goal}
            </span>
          </div>
        )}
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
            <button className="btn primary" onClick={exportReport}>
              Générer le rapport
            </button>
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

          {insights.length > 0 && (
            <div className="card insights-card">
              <div className="qstat-head">
                <h3 className="qstat-title">Ce qui ressort de vos données</h3>
                <span className="qstat-meta">croisements automatiques</span>
              </div>
              <ul className="insights-list">
                {insights.map((i) => (
                  <li key={i.text}>{i.text}</li>
                ))}
              </ul>
            </div>
          )}

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

          {(team.length > 1 || (team.length === 1 && team[0][0] !== '(non signé)')) && (
            <>
              <h2 className="section-title">Équipe de collecte</h2>
              <div className="card qstat">
                <div className="bars">
                  {team.map(([who, n]) => {
                    const max = team[0][1]
                    const pct = Math.round((n / submissions.length) * 100)
                    return (
                      <div key={who} className="bar-row" title={`${who} : ${n}`}>
                        <span className="bar-label">{who}</span>
                        <span className="bar-track">
                          <span
                            className="bar-fill"
                            style={{ width: `${(n / max) * 100}%` }}
                          />
                        </span>
                        <span className="bar-value">
                          {n}
                          <span className="bar-pct"> · {pct} %</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          {located.length > 0 && (
            <>
              <h2 className="section-title">Localisation</h2>
              <div className="card qstat">
                <div className="qstat-head">
                  <h3 className="qstat-title">Lieux d’entretien</h3>
                  <span className="qstat-meta">
                    {located.length}/{submissions.length} géolocalisés
                  </span>
                </div>
                <GeoScatter points={located} />
                <p className="geo-links">
                  {located.slice(-8).map((s) => (
                    <a
                      key={s.id}
                      href={`https://www.openstreetmap.org/?mlat=${s.lat}&mlon=${s.lng}#map=16/${s.lat}/${s.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="geo-link"
                    >
                      {dateFmt.format(s.submittedAt)} ↗
                    </a>
                  ))}
                </p>
              </div>
            </>
          )}

          <h2 className="section-title">Données brutes</h2>
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Enquêteur</th>
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
                    <td className="td-date" title={s.collectorEmail ?? ''}>
                      {collectorLabel(s)}
                    </td>
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
