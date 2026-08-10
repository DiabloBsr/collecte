/**
 * Assistant IA de création de formulaire — fonction serveur Vercel.
 * La clé LLM (GEMINI_API_KEY) ne vit que côté serveur. Accès réservé aux
 * utilisateurs connectés (n'importe quel rôle : créer un questionnaire est
 * une action de membre, pas d'admin).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient } from '@supabase/supabase-js'

const SYSTEM = `Tu es l'assistant de création de questionnaires de « Collecte », une application française de collecte de données d'enquête terrain (Madagascar).
À partir de la demande de l'utilisateur, tu conçois les questions du formulaire.
Types disponibles : "text" (texte libre), "number" (nombre), "radio" (choix unique), "checkbox" (choix multiples).
Sections : "identity" (infos sur la personne interrogée : nom, âge, sexe, téléphone, localité…) ou "survey" (les questions de l'enquête elle-même).
Déduis intelligemment le type de chaque question : âge/quantité/revenu → number ; oui-non ou une seule réponse possible → radio avec ses options ; « lesquels parmi… » → checkbox ; identité/verbatim → text.
Options en français, 2 à 6 par question à choix (ajoute « Autre » quand pertinent). required=true seulement pour l'indispensable.
Si la demande est ambiguë (par ex. tu hésites entre nombre et choix), pose ta question de clarification dans "reply" — et propose quand même tout ce qui est sûr.
Réponds STRICTEMENT en JSON, rien d'autre :
{"reply": "<ta réponse conversationnelle en français, brève>", "questions": [{"label": "…", "type": "…", "section": "…", "options": ["…"], "required": false}]}
"questions" peut être vide si tu as d'abord besoin de précisions.`

const TYPES = ['text', 'number', 'radio', 'checkbox']

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Méthode non autorisée.' })
    return
  }
  const url = process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const geminiKey = process.env.GEMINI_API_KEY
  if (!url || !serviceKey) {
    res.status(500).json({ error: 'Configuration serveur incomplète.' })
    return
  }
  if (!geminiKey) {
    res.status(500).json({
      error: 'IA non configurée : clé GEMINI_API_KEY manquante côté serveur.',
    })
    return
  }

  const authHeader = req.headers.authorization ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) {
    res.status(401).json({ error: 'Non authentifié.' })
    return
  }
  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: caller, error: callerError } = await sb.auth.getUser(token)
  if (callerError || !caller?.user) {
    res.status(401).json({ error: 'Session invalide ou expirée.' })
    return
  }

  const body = (req.body ?? {}) as { messages?: unknown }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : []
  const contents = messages
    .filter(
      (m): m is { role: string; content: string } =>
        !!m &&
        typeof (m as { content?: unknown }).content === 'string' &&
        ((m as { role?: unknown }).role === 'user' ||
          (m as { role?: unknown }).role === 'assistant'),
    )
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content.slice(0, 4000) }],
    }))
  if (contents.length === 0) {
    res.status(400).json({ error: 'Message manquant.' })
    return
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  let response: Response
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents,
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        }),
      },
    )
  } catch {
    res.status(502).json({ error: 'IA injoignable — réessayez.' })
    return
  }
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300)
    res.status(502).json({ error: `IA indisponible (HTTP ${response.status}).`, detail })
    return
  }
  const out = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text =
    out.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  let parsed: { reply?: unknown; questions?: unknown }
  try {
    parsed = JSON.parse(text) as { reply?: unknown; questions?: unknown }
  } catch {
    res.status(502).json({ error: 'Réponse IA illisible — réessayez.' })
    return
  }

  const questions = (Array.isArray(parsed.questions) ? parsed.questions : [])
    .filter(
      (q): q is Record<string, unknown> =>
        !!q && typeof (q as { label?: unknown }).label === 'string' &&
        ((q as { label: string }).label.trim().length > 0),
    )
    .slice(0, 30)
    .map((q) => {
      const type = TYPES.includes(q.type as string) ? (q.type as string) : 'text'
      const isChoice = type === 'radio' || type === 'checkbox'
      return {
        label: (q.label as string).trim().slice(0, 200),
        type,
        section: q.section === 'identity' ? 'identity' : 'survey',
        options: isChoice && Array.isArray(q.options)
          ? (q.options as unknown[])
              .filter((o): o is string => typeof o === 'string' && o.trim() !== '')
              .map((o) => o.trim().slice(0, 80))
              .slice(0, 10)
          : [],
        required: q.required === true,
      }
    })
    .filter((q) => (q.type !== 'radio' && q.type !== 'checkbox') || q.options.length >= 2)

  res.status(200).json({
    reply: typeof parsed.reply === 'string' ? parsed.reply : '',
    questions,
  })
}
