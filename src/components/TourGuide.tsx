import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'

export interface TourStep {
  target?: string
  title: string
  content: string
  position?: 'top' | 'bottom' | 'left' | 'right'
}

interface Props {
  steps: TourStep[]
  storageKey: string
  onDone?: () => void
}

const PAD = 8   // padding around highlighted element
const TIP = 280 // tooltip width

interface Rect { top: number; left: number; width: number; height: number }

function getRect(selector: string): Rect | null {
  const el = document.querySelector(selector)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val))
}

export default function TourGuide({ steps, storageKey, onDone }: Props) {
  const [active, setActive] = useState(() => localStorage.getItem(storageKey) !== 'done')
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const scrollRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const current = steps[step]
  const isFirst = step === 0
  const isLast = step === steps.length - 1

  const measure = useCallback(() => {
    if (!current?.target) { setRect(null); return }
    const r = getRect(current.target)
    setRect(r)
    if (r) {
      const el = document.querySelector(current.target) as HTMLElement | null
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [current])

  useEffect(() => {
    if (!active) return
    if (scrollRef.current) clearTimeout(scrollRef.current)
    scrollRef.current = setTimeout(measure, 120)
    return () => { if (scrollRef.current) clearTimeout(scrollRef.current) }
  }, [active, step, measure])

  useEffect(() => {
    if (!active) return
    const handler = () => measure()
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [active, measure])

  const finish = useCallback((persist = true) => {
    if (persist) localStorage.setItem(storageKey, 'done')
    setActive(false)
    onDone?.()
  }, [storageKey, onDone])

  const next = () => { if (isLast) finish(); else setStep(s => s + 1) }
  const back = () => { if (step > 0) setStep(s => s - 1) }

  if (!active) return null

  const vh = window.innerHeight
  const vw = window.innerWidth

  // ── 4-rect overlay ──────────────────────────────────────────────────────────
  const highlighted = rect
    ? {
        top:    rect.top    - PAD,
        left:   rect.left   - PAD,
        width:  rect.width  + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : null

  // ── tooltip position ────────────────────────────────────────────────────────
  let tooltipStyle: React.CSSProperties = {}
  let arrowClass = ''

  if (!highlighted) {
    // centered card
    tooltipStyle = {
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: TIP + 40,
      zIndex: 10001,
    }
  } else {
    const explicitPos = current?.position
    const autoBelow = highlighted.top < vh * 0.5

    let pos = explicitPos ?? (autoBelow ? 'bottom' : 'top')

    // If below but not enough room, flip
    if (pos === 'bottom' && highlighted.top + highlighted.height + 180 > vh) pos = 'top'
    if (pos === 'top'    && highlighted.top - 180 < 0)                        pos = 'bottom'

    const hCenterLeft = clamp(
      highlighted.left + highlighted.width / 2 - TIP / 2,
      8,
      vw - TIP - 8
    )

    if (pos === 'bottom') {
      tooltipStyle = {
        position: 'fixed',
        top:  highlighted.top + highlighted.height + 12,
        left: hCenterLeft,
        width: TIP,
        zIndex: 10001,
      }
      arrowClass = 'arrow-top'
    } else if (pos === 'top') {
      tooltipStyle = {
        position: 'fixed',
        top:  highlighted.top - 12,
        left: hCenterLeft,
        width: TIP,
        transform: 'translateY(-100%)',
        zIndex: 10001,
      }
      arrowClass = 'arrow-bottom'
    } else if (pos === 'right') {
      tooltipStyle = {
        position: 'fixed',
        top:  clamp(highlighted.top + highlighted.height / 2 - 60, 8, vh - 160),
        left: highlighted.left + highlighted.width + 12,
        width: TIP,
        zIndex: 10001,
      }
      arrowClass = 'arrow-left'
    } else {
      tooltipStyle = {
        position: 'fixed',
        top:  clamp(highlighted.top + highlighted.height / 2 - 60, 8, vh - 160),
        left: highlighted.left - TIP - 12,
        width: TIP,
        zIndex: 10001,
      }
      arrowClass = 'arrow-right'
    }
  }

  return createPortal(
    <>
      {/* ── Overlay: 4 rectangles ── */}
      {highlighted ? (
        <>
          {/* top */}
          <div style={{ position:'fixed', inset:0, top:0, left:0, right:0,
            height: highlighted.top, background:'rgba(0,0,0,0.52)', zIndex:10000, pointerEvents:'all' }} />
          {/* bottom */}
          <div style={{ position:'fixed', left:0, right:0, bottom:0,
            top: highlighted.top + highlighted.height, background:'rgba(0,0,0,0.52)', zIndex:10000, pointerEvents:'all' }} />
          {/* left */}
          <div style={{ position:'fixed', top: highlighted.top, left:0,
            width: highlighted.left, height: highlighted.height, background:'rgba(0,0,0,0.52)', zIndex:10000, pointerEvents:'all' }} />
          {/* right */}
          <div style={{ position:'fixed', top: highlighted.top,
            left: highlighted.left + highlighted.width, right:0,
            height: highlighted.height, background:'rgba(0,0,0,0.52)', zIndex:10000, pointerEvents:'all' }} />
          {/* highlight ring */}
          <div style={{
            position:'fixed',
            top:    highlighted.top,
            left:   highlighted.left,
            width:  highlighted.width,
            height: highlighted.height,
            borderRadius: 8,
            boxShadow: '0 0 0 3px #3b82f6, 0 0 0 6px rgba(59,130,246,0.25)',
            zIndex: 10000,
            pointerEvents: 'none',
            animation: 'tourPulse 1.8s ease-in-out infinite',
          }} />
        </>
      ) : (
        /* full-screen backdrop for centered card */
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.52)', zIndex:10000, pointerEvents:'all' }} />
      )}

      {/* ── Tooltip card ── */}
      <div style={tooltipStyle}>
        {/* Arrow */}
        {arrowClass && (
          <div style={{
            position:'absolute',
            width:0, height:0,
            ...(arrowClass === 'arrow-top'    ? { top:'-8px',    left:'50%', marginLeft:'-8px', borderLeft:'8px solid transparent', borderRight:'8px solid transparent', borderBottom:'8px solid white' } : {}),
            ...(arrowClass === 'arrow-bottom' ? { bottom:'-8px', left:'50%', marginLeft:'-8px', borderLeft:'8px solid transparent', borderRight:'8px solid transparent', borderTop:'8px solid white' } : {}),
            ...(arrowClass === 'arrow-left'   ? { left:'-8px',   top:'20px', borderTop:'8px solid transparent', borderBottom:'8px solid transparent', borderRight:'8px solid white' } : {}),
            ...(arrowClass === 'arrow-right'  ? { right:'-8px',  top:'20px', borderTop:'8px solid transparent', borderBottom:'8px solid transparent', borderLeft:'8px solid white' } : {}),
          }} />
        )}

        {/* Card body */}
        <div style={{
          background:'white',
          borderRadius:14,
          boxShadow:'0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.10)',
          padding:'16px 18px 14px',
          position:'relative',
        }}>
          {/* Header row */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
            <span style={{ fontSize:11, color:'#9ca3af', fontWeight:500 }}>
              Step {step + 1} of {steps.length}
            </span>
            <button
              onClick={() => finish()}
              style={{ fontSize:11, color:'#9ca3af', background:'none', border:'none', cursor:'pointer', padding:'0 0 0 8px', lineHeight:1 }}
              title="Skip tour"
            >
              Skip ✕
            </button>
          </div>

          <div style={{ fontSize:14, fontWeight:700, color:'#111827', marginBottom:6, lineHeight:1.3 }}>
            {current.title}
          </div>
          <div style={{ fontSize:12.5, color:'#4b5563', lineHeight:1.55, marginBottom:14 }}>
            {current.content}
          </div>

          {/* Footer row */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', gap:8 }}>
            <div style={{ display:'flex', gap:6 }}>
              {/* Step dots */}
              {steps.map((_, i) => (
                <div key={i} style={{
                  width: i === step ? 16 : 6,
                  height:6, borderRadius:3,
                  background: i === step ? '#3b82f6' : '#d1d5db',
                  transition:'all 0.25s',
                }} />
              ))}
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {!isFirst && (
                <button
                  onClick={back}
                  style={{
                    fontSize:12, color:'#6b7280', background:'white',
                    border:'1px solid #e5e7eb', borderRadius:8,
                    padding:'5px 12px', cursor:'pointer', fontWeight:500,
                  }}
                >
                  Back
                </button>
              )}
              <button
                onClick={next}
                style={{
                  fontSize:12, color:'white', background:'#2563eb',
                  border:'none', borderRadius:8,
                  padding:'5px 14px', cursor:'pointer', fontWeight:600,
                }}
              >
                {isLast ? 'Done ✓' : 'Next →'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes tourPulse {
          0%, 100% { box-shadow: 0 0 0 3px #3b82f6, 0 0 0 6px rgba(59,130,246,0.25); }
          50%       { box-shadow: 0 0 0 3px #2563eb, 0 0 0 10px rgba(59,130,246,0.12); }
        }
      `}</style>
    </>,
    document.body
  )
}
