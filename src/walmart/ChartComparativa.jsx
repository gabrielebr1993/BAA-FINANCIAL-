// Comparativa período actual vs anterior (barras agrupadas), SVG puro.
const fmt = (v) => `$${Math.round(Number(v) || 0).toLocaleString('en-US')}`

export default function ChartComparativa({ data = [] }) {
  const W = 560, H = 230, padL = 48, padR = 10, padT = 14, padB = 40
  const plotW = W - padL - padR, plotH = H - padT - padB
  const n = Math.max(1, data.length)
  const max = Math.max(1, ...data.flatMap((d) => [d.actual || 0, d.anterior || 0]))
  const gw = plotW / n
  const bw = Math.max(10, Math.min(28, gw / 3))
  const yOf = (v) => padT + plotH - (Math.max(0, v) / max) * plotH
  const ticks = 4

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="230" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Comparativa período actual vs anterior">
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = (max * i) / ticks, y = yOf(v)
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="#e3e6ec" strokeDasharray="3 3" />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#8a97ac">{i === 0 ? '0' : fmt(v)}</text>
            </g>
          )
        })}
        {data.map((d, i) => {
          const cx = padL + i * gw + gw / 2
          const ya = yOf(d.actual || 0), yp = yOf(d.anterior || 0)
          return (
            <g key={i}>
              <rect x={cx - bw - 1} y={ya} width={bw} height={padT + plotH - ya} fill="#13233f" rx="2"><title>{`${d.label} · actual ${fmt(d.actual || 0)}`}</title></rect>
              <rect x={cx + 1} y={yp} width={bw} height={padT + plotH - yp} fill="#c9a24b" rx="2"><title>{`${d.label} · anterior ${fmt(d.anterior || 0)}`}</title></rect>
              <text x={cx} y={H - padB + 15} textAnchor="middle" fontSize="10" fill="#5c6b84" fontWeight="600">{d.label}</text>
            </g>
          )
        })}
      </svg>
      <div className="mt-1 flex items-center justify-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#13233f' }} /> Este período</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#c9a24b' }} /> Período anterior</span>
      </div>
    </div>
  )
}
