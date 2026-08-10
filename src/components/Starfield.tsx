import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { CSSProperties } from 'react'

/**
 * Ciel étoilé animé, rendu dans un canvas unique (une seule boucle rAF).
 *
 * · les étoiles proches du curseur se relient en constellations éphémères ;
 * · des étoiles filantes traversent le ciel ;
 * · une constellation d'or dessine la silhouette de Madagascar, nœud par nœud.
 *
 * Garde-fous : densité réduite sur petit écran, DPR plafonné à 2, boucle mise
 * en pause quand l'onglet est caché, rendu statique complet si l'utilisateur
 * demande moins d'animations, et nettoyage intégral (rAF + écouteurs) au
 * démontage.
 */

export type StarfieldHandle = {
  /** Étincelle qui s'envole du point écran (x, y) et devient une étoile. */
  spark: (x: number, y: number) => void
  /** Onde circulaire + naissance d'une étoile au point écran (x, y). */
  ripple: (x: number, y: number) => void
}

type StarfieldProps = {
  className?: string
  style?: CSSProperties
  /** Dessine la constellation dorée de Madagascar (par défaut : oui). */
  madagascar?: boolean
}

type Star = {
  rx: number
  ry: number
  r: number
  warm: boolean
  major: boolean
  ph: number
  spd: number
  born: number
}
type Shoot = { x: number; y: number; vx: number; vy: number; dur: number; life: number }
type Spark = { x0: number; y0: number; x1: number; y1: number; t: number }
type Ring = { x: number; y: number; t: number }

/** Côte malgache simplifiée, en coordonnées normalisées (0 → 1). */
const MG: readonly (readonly [number, number])[] = [
  [0.836, 0.0], [0.945, 0.066], [0.986, 0.213], [0.918, 0.36], [0.849, 0.493],
  [0.767, 0.647], [0.644, 0.794], [0.534, 0.941], [0.329, 0.993], [0.151, 0.971],
  [0.068, 0.853], [0.096, 0.757], [0.041, 0.684], [0.151, 0.603], [0.11, 0.507],
  [0.11, 0.404], [0.178, 0.309], [0.425, 0.279], [0.589, 0.191], [0.658, 0.118],
  [0.767, 0.044],
]

const MG_LABELS: readonly {
  i: number
  t: string
  dx: number
  dy: number
  right?: boolean
}[] = [
  { i: 0, t: 'Antsiranana', dx: 9, dy: -6 },
  { i: 17, t: 'Mahajanga', dx: -9, dy: -9, right: true },
  { i: 4, t: 'Toamasina', dx: 11, dy: 3 },
  { i: 10, t: 'Toliara', dx: -11, dy: 5, right: true },
  { i: 7, t: 'Taolagnaro', dx: 11, dy: 9 },
]

const CAPITAL = { x: 0.589, y: 0.507, t: 'Antananarivo' }
const TAU = Math.PI * 2

const Starfield = forwardRef<StarfieldHandle, StarfieldProps>(function Starfield(
  { className, style, madagascar = true },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // L'API impérative est (re)branchée par l'effet ; elle est neutralisée au
  // démontage pour qu'un appel tardif ne touche pas un canvas disparu.
  const api = useRef<StarfieldHandle | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      spark: (x, y) => api.current?.spark(x, y),
      ripple: (x, y) => api.current?.ripple(x, y),
    }),
    [],
  )

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const context = el.getContext('2d')
    if (!context) return
    // Réassignation typée : les fonctions ci-dessous sont hoistées, TypeScript
    // ne conserverait pas l'affinement de type au travers de leur portée.
    const canvas: HTMLCanvasElement = el
    const ctx: CanvasRenderingContext2D = context

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const coarse = window.matchMedia('(pointer: coarse)')

    let W = 0
    let H = 0
    let cap = 260
    const stars: Star[] = []
    const shoots: Shoot[] = []
    const sparks: Spark[] = []
    const rings: Ring[] = []
    const pointer = { x: -1e4, y: -1e4, active: false }
    const mgBox = { x: 0, y: 0, w: 0, h: 0 }
    const ignite: number[] = MG.map(() => -1)

    let energy = 0
    let raf = 0
    let resizeRaf = 0
    let running = false
    let last = 0
    let clock = 0
    let mgProg = 0
    let mgLabelA = 0
    let mgAlpha = 1
    let nextShoot = 2.4
    let lastSpark = 0

    /* ── Étoiles ─────────────────────────────────────────────────────── */

    function mkStar(rx: number, ry: number, instant: boolean): Star {
      const major = Math.random() < 0.06
      return {
        rx,
        ry,
        r: major ? 1.9 + Math.random() * 0.8 : 0.55 + Math.random() * 1.25,
        warm: Math.random() < 0.2,
        major,
        ph: Math.random() * TAU,
        spd: 0.4 + Math.random() * 1.1,
        born: instant ? 1 : 0,
      }
    }

    function addStar(s: Star) {
      stars.push(s)
      while (stars.length > cap) stars.shift()
    }

    /** Moins d'étoiles sur petit écran : le mobile paie chaque pixel. */
    function starTarget(): number {
      const small = W < 700
      const n = Math.round((W * H) / (small ? 5200 : 9000))
      return small ? Math.max(30, Math.min(96, n)) : Math.max(90, Math.min(240, n))
    }

    /* ── Mise en page ────────────────────────────────────────────────── */

    function layoutMg() {
      const compact = W < 960
      const bh = (compact ? 0.46 : 0.62) * H
      const bw = bh * 0.53
      const cx = compact ? W * 0.5 : Math.max(bw * 0.62 + 30, W * 0.3)
      const cy = compact ? H * 0.4 : H * 0.52
      mgBox.x = cx - bw / 2
      mgBox.y = cy - bh / 2
      mgBox.w = bw
      mgBox.h = bh
      // Filigrane : la constellation passe derrière le texte de la page, elle
      // ne doit jamais lui disputer la lisibilité.
      mgAlpha = compact ? 0.4 : 0.85
    }

    function resize() {
      const w = canvas.clientWidth || window.innerWidth
      const h = canvas.clientHeight || window.innerHeight
      if (w <= 0 || h <= 0) return
      W = w
      H = h
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const pw = Math.round(w * dpr)
      const ph = Math.round(h * dpr)
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw
        canvas.height = ph
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      layoutMg()
      const target = starTarget()
      cap = target + 70
      while (stars.length < target) stars.push(mkStar(Math.random(), Math.random(), true))
      if (stars.length > cap) stars.length = cap
      if (!running) drawStill()
    }

    /* ── Madagascar : la constellation se dessine nœud par nœud ──────── */

    const mgX = (i: number) => mgBox.x + MG[i % MG.length][0] * mgBox.w
    const mgY = (i: number) => mgBox.y + MG[i % MG.length][1] * mgBox.h

    function drawMg(t: number, dt: number) {
      const n = MG.length
      if (!reduced.matches && clock > 1) mgProg = Math.min(1, mgProg + dt / 7)
      const P = mgProg
      if (P <= 0) return
      if (ignite[0] < 0) ignite[0] = t

      const pulse = 0.75 + 0.25 * Math.sin(t * 0.8)
      const lineA = (P >= 1 ? 0.15 + 0.07 * pulse : 0.3) * mgAlpha
      ctx.lineWidth = 1
      ctx.strokeStyle = `rgba(246,198,109,${lineA.toFixed(3)})`
      ctx.beginPath()
      for (let i = 0; i < n; i++) {
        const sp = Math.max(0, Math.min(1, P * n - i))
        if (sp <= 0) break
        if (sp >= 1 && ignite[(i + 1) % n] < 0) ignite[(i + 1) % n] = t
        const x0 = mgX(i)
        const y0 = mgY(i)
        ctx.moveTo(x0, y0)
        ctx.lineTo(x0 + (mgX(i + 1) - x0) * sp, y0 + (mgY(i + 1) - y0) * sp)
      }
      ctx.stroke()

      if (P >= 1) {
        ctx.beginPath()
        ctx.moveTo(mgX(0), mgY(0))
        for (let f = 1; f < n; f++) ctx.lineTo(mgX(f), mgY(f))
        ctx.closePath()
        ctx.fillStyle = `rgba(246,198,109,${(0.028 * mgAlpha).toFixed(3)})`
        ctx.fill()
        mgLabelA = Math.min(1, mgLabelA + (dt || 0.1) / 1.2)
      }

      ctx.fillStyle = '#ffd98e'
      for (let k = 0; k < n; k++) {
        if (ignite[k] < 0) continue
        const age = t - ignite[k]
        const pop = age < 0.5 ? 1 + (1 - age / 0.5) * 2.2 : 1
        ctx.globalAlpha = (0.5 + 0.28 * Math.sin(t * 1.3 + k * 1.7)) * mgAlpha
        ctx.beginPath()
        ctx.arc(mgX(k), mgY(k), 1.6 * pop, 0, TAU)
        ctx.fill()
        if (age < 0.5) {
          ctx.globalAlpha = (1 - age / 0.5) * 0.35 * mgAlpha
          ctx.beginPath()
          ctx.arc(mgX(k), mgY(k), 9 * pop, 0, TAU)
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1

      // Antananarivo, cœur battant au centre de l'île.
      if (P > 0.55) {
        const cx = mgBox.x + CAPITAL.x * mgBox.w
        const cy = mgBox.y + CAPITAL.y * mgBox.h
        const a = Math.min(1, (P - 0.55) / 0.3) * mgAlpha
        const pl = 0.7 + 0.3 * Math.sin(t * 2)
        ctx.globalAlpha = a * pl
        ctx.fillStyle = '#ffe7b0'
        ctx.beginPath()
        ctx.arc(cx, cy, 2.5, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = a * pl * 0.5
        ctx.strokeStyle = '#ffe7b0'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(cx - 8, cy)
        ctx.lineTo(cx + 8, cy)
        ctx.moveTo(cx, cy - 8)
        ctx.lineTo(cx, cy + 8)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // Les toponymes ne s'affichent que si la constellation est assez grande
      // pour les porter sans venir se poser sur le texte de la page.
      if (mgLabelA > 0 && mgBox.w > 220) {
        ctx.font = '10px "Spline Sans Mono", ui-monospace, monospace'
        ctx.fillStyle = `rgba(214,226,255,${(0.55 * mgLabelA * mgAlpha).toFixed(3)})`
        for (const lb of MG_LABELS) {
          ctx.textAlign = lb.right ? 'right' : 'left'
          ctx.fillText(lb.t, mgX(lb.i) + lb.dx, mgY(lb.i) + lb.dy)
        }
        ctx.textAlign = 'left'
        ctx.fillStyle = `rgba(255,231,176,${(0.75 * mgLabelA * mgAlpha).toFixed(3)})`
        ctx.fillText(
          CAPITAL.t,
          mgBox.x + CAPITAL.x * mgBox.w + 10,
          mgBox.y + CAPITAL.y * mgBox.h + 3,
        )
      }
    }

    /* ── Constellations au curseur ───────────────────────────────────── */

    function drawLinks() {
      if (pointer.active) energy += (1 - energy) * 0.07
      else energy *= 0.94
      if (energy < 0.015) return

      const R = Math.min(210, Math.max(140, W * 0.12))
      const R2 = R * R
      const LINK = R * 0.66
      const maxNear = coarse.matches ? 26 : 52
      const near: { x: number; y: number; d: number }[] = []
      for (const s of stars) {
        const x = s.rx * W
        const y = s.ry * H
        const dx = x - pointer.x
        const dy = y - pointer.y
        const d2 = dx * dx + dy * dy
        if (d2 < R2) {
          near.push({ x, y, d: Math.sqrt(d2) })
          if (near.length >= maxNear) break
        }
      }
      ctx.lineWidth = 1
      for (let a = 0; a < near.length; a++) {
        const A = near[a]
        const fa = energy * (1 - A.d / R) * 0.12
        if (fa > 0.012) {
          ctx.strokeStyle = `rgba(156,195,255,${fa.toFixed(3)})`
          ctx.beginPath()
          ctx.moveTo(pointer.x, pointer.y)
          ctx.lineTo(A.x, A.y)
          ctx.stroke()
        }
        for (let b = a + 1; b < near.length; b++) {
          const B = near[b]
          const ddx = A.x - B.x
          const ddy = A.y - B.y
          const d = Math.sqrt(ddx * ddx + ddy * ddy)
          if (d >= LINK) continue
          const al = energy * (1 - A.d / R) * (1 - B.d / R) * (1 - d / LINK) * 0.85
          if (al > 0.02) {
            ctx.strokeStyle = `rgba(176,205,255,${al.toFixed(3)})`
            ctx.beginPath()
            ctx.moveTo(A.x, A.y)
            ctx.lineTo(B.x, B.y)
            ctx.stroke()
          }
        }
      }
      const g = ctx.createRadialGradient(
        pointer.x, pointer.y, 0,
        pointer.x, pointer.y, R * 0.8,
      )
      g.addColorStop(0, `rgba(156,195,255,${(energy * 0.05).toFixed(3)})`)
      g.addColorStop(1, 'rgba(156,195,255,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(pointer.x, pointer.y, R * 0.8, 0, TAU)
      ctx.fill()
    }

    /* ── Étoiles, filantes, étincelles, ondes ────────────────────────── */

    function drawStars(t: number, dt: number, still: boolean) {
      for (const s of stars) {
        if (s.born < 1) s.born = Math.min(1, s.born + dt / 1.4)
        const x = s.rx * W
        const y = s.ry * H
        const tw = still ? 0.72 : Math.max(0.06, 0.45 + 0.4 * Math.sin(t * s.spd + s.ph))
        ctx.globalAlpha = tw * s.born
        ctx.fillStyle = s.warm ? '#ffd9a0' : '#dfe8ff'
        ctx.beginPath()
        ctx.arc(x, y, s.r, 0, TAU)
        ctx.fill()
        if (s.major) {
          ctx.globalAlpha *= 0.45
          ctx.strokeStyle = ctx.fillStyle
          ctx.lineWidth = 1
          const fl = s.r * 3.1
          ctx.beginPath()
          ctx.moveTo(x - fl, y)
          ctx.lineTo(x + fl, y)
          ctx.moveTo(x, y - fl)
          ctx.lineTo(x, y + fl)
          ctx.stroke()
        }
      }
      ctx.globalAlpha = 1
    }

    function spawnShoot() {
      if (shoots.length >= 3) return
      const fromLeft = Math.random() < 0.5
      const ang = fromLeft
        ? 0.5 + Math.random() * 0.35
        : Math.PI - 0.5 - Math.random() * 0.35
      const sp = 720 + Math.random() * 520
      shoots.push({
        x: Math.random() * W,
        y: -20 + Math.random() * H * 0.3,
        vx: Math.cos(ang) * sp,
        vy: Math.abs(Math.sin(ang)) * sp * 0.55,
        dur: 0.9 + Math.random() * 0.6,
        life: 0,
      })
    }

    function drawShoots(dt: number) {
      for (let i = shoots.length - 1; i >= 0; i--) {
        const s = shoots[i]
        s.life += dt / s.dur
        if (s.life >= 1) {
          shoots.splice(i, 1)
          continue
        }
        const p = s.life
        const hx = s.x + s.vx * p * s.dur
        const hy = s.y + s.vy * p * s.dur
        const tx = hx - s.vx * 0.13
        const ty = hy - s.vy * 0.13
        const a = Math.sin(Math.PI * p) * 0.85
        const g = ctx.createLinearGradient(hx, hy, tx, ty)
        g.addColorStop(0, `rgba(255,244,214,${a.toFixed(3)})`)
        g.addColorStop(1, 'rgba(255,244,214,0)')
        ctx.strokeStyle = g
        ctx.lineWidth = 1.6
        ctx.beginPath()
        ctx.moveTo(hx, hy)
        ctx.lineTo(tx, ty)
        ctx.stroke()
        ctx.globalAlpha = a
        ctx.fillStyle = '#fff7e2'
        ctx.beginPath()
        ctx.arc(hx, hy, 1.7, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    function drawSparks(dt: number) {
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]
        p.t += dt / 1.15
        if (p.t >= 1) {
          const born = mkStar(p.x1 / W, p.y1 / H, false)
          born.warm = true
          addStar(born)
          sparks.splice(i, 1)
          continue
        }
        const e = 1 - Math.pow(1 - p.t, 3)
        const x = p.x0 + (p.x1 - p.x0) * e
        const y = p.y0 + (p.y1 - p.y0) * e - Math.sin(Math.PI * p.t) * 40
        ctx.fillStyle = '#ffdf9e'
        ctx.globalAlpha = 0.95 * (1 - p.t * 0.3)
        ctx.beginPath()
        ctx.arc(x, y, 2.1, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 0.3
        ctx.beginPath()
        ctx.arc(x, y, 5.5, 0, TAU)
        ctx.fill()
        ctx.globalAlpha = 1
      }
    }

    function drawRings(dt: number) {
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]
        r.t += dt / 0.7
        if (r.t >= 1) {
          rings.splice(i, 1)
          continue
        }
        ctx.globalAlpha = (1 - r.t) * 0.4
        ctx.strokeStyle = '#f6c66d'
        ctx.lineWidth = 1.3
        ctx.beginPath()
        ctx.arc(r.x, r.y, 6 + r.t * 54, 0, TAU)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }

    /* ── Boucle ──────────────────────────────────────────────────────── */

    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      clock += dt
      const t = clock
      ctx.clearRect(0, 0, W, H)
      if (madagascar) drawMg(t, dt)
      drawLinks()
      drawStars(t, dt, false)
      drawSparks(dt)
      drawShoots(dt)
      drawRings(dt)
      if (t > nextShoot) {
        spawnShoot()
        nextShoot = t + 2.8 + Math.random() * 4.5
      }
      raf = requestAnimationFrame(frame)
    }

    /** Ciel complet et immobile : mouvement réduit, ou onglet en pause. */
    function drawStill() {
      if (W <= 0 || H <= 0) return
      mgProg = 1
      mgLabelA = 1
      for (let i = 0; i < ignite.length; i++) ignite[i] = 0
      ctx.clearRect(0, 0, W, H)
      if (madagascar) drawMg(10, 0)
      for (const s of stars) s.born = 1
      drawStars(0, 0, true)
    }

    function start() {
      if (running || reduced.matches || document.hidden) return
      running = true
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }

    function stop() {
      running = false
      cancelAnimationFrame(raf)
      raf = 0
    }

    /* ── Écouteurs ───────────────────────────────────────────────────── */

    const onPointer = (e: PointerEvent) => {
      pointer.x = e.clientX
      pointer.y = e.clientY
      pointer.active = true
    }
    const onLeave = () => {
      pointer.active = false
    }
    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    const onReduced = () => {
      if (reduced.matches) {
        stop()
        drawStill()
      } else {
        mgProg = 0
        mgLabelA = 0
        for (let i = 0; i < ignite.length; i++) ignite[i] = -1
        clock = 0
        start()
      }
    }

    const ro = new ResizeObserver(() => {
      if (resizeRaf) return
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0
        resize()
      })
    })

    resize()
    ro.observe(canvas)
    window.addEventListener('resize', resize, { passive: true })
    window.addEventListener('pointermove', onPointer, { passive: true })
    window.addEventListener('pointerdown', onPointer, { passive: true })
    window.addEventListener('blur', onLeave)
    document.addEventListener('pointerleave', onLeave)
    document.addEventListener('visibilitychange', onVisibility)
    reduced.addEventListener('change', onReduced)

    api.current = {
      spark(x, y) {
        if (reduced.matches || W <= 0) return
        const now = performance.now()
        if (now - lastSpark < 90) return
        lastSpark = now
        sparks.push({
          x0: x,
          y0: y,
          x1: W * (0.08 + Math.random() * 0.84),
          y1: H * (0.04 + Math.random() * 0.4),
          t: 0,
        })
      },
      ripple(x, y) {
        if (reduced.matches || W <= 0) return
        rings.push({ x, y, t: 0 })
        addStar(mkStar(x / W, y / H, false))
      },
    }

    if (reduced.matches) drawStill()
    else start()

    return () => {
      api.current = null
      stop()
      if (resizeRaf) cancelAnimationFrame(resizeRaf)
      ro.disconnect()
      window.removeEventListener('resize', resize)
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('blur', onLeave)
      document.removeEventListener('pointerleave', onLeave)
      document.removeEventListener('visibilitychange', onVisibility)
      reduced.removeEventListener('change', onReduced)
    }
  }, [madagascar])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'block',
        width: '100%',
        height: '100%',
        zIndex: 0,
        pointerEvents: 'none',
        ...style,
      }}
    />
  )
})

export default Starfield
