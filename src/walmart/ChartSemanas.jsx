// Gráfica de barras (ingreso vs resultado) en SVG puro — sin librerías, para
// que el Dashboard de Walmart cargue al instante. Tooltips nativos (<title>).
const fmt = (v) => `$${Math.round(Number(v) || 0).toLocaleString('en-US')}`

export default function ChartSemanas({ data = [] }) {
  const W = 560, H = 248, padL = 46, padR = 10, padT = 12, padB = 26
  const plotW = W - padL - padR, plotH = H - padT - padB
  const n = Math.max(1, data.length)
  const max = Math.max(1, ...data.flatMap((d) => [d.Ingreso || 0, d.Resultado || 0]))
  const groupW = plotW / n
  const barW = Math.max(6, Math.min(16, groupW / 3))
  const yOf = (v) => padT + plotH - (Math.max(0, v) / max) * plotH
  const ticks = 4

  return (
    <div>
      <div style={{ width: '100%' }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="248" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Ingreso vs resultado por semana">
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
            const cx = padL + i * groupW + groupW / 2
            const yi = yOf(d.Ingreso || 0), yr = yOf(d.Resultado || 0)
            return (
              <g key={i}>
                <rect x={cx - barW - 1} y={yi} width={barW} height={padT + plotH - yi} fill="#13233f" rx="2"><title>{`${d.semana} · Ingreso ${fmt(d.Ingreso || 0)}`}</title></rect>
                <rect x={cx + 1} y={yr} width={barW} height={padT + plotH - yr} fill="#c9a24b" rx="2"><title>{`${d.semana} · Resultado ${fmt(d.Resultado || 0)}`}</title></rect>
                <text x={cx} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="#8a97ac">{d.semana}</text>
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-1 flex items-center justify-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#13233f' }} /> Ingreso</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: '#c9a24b' }} /> Resultado</span>
      </div>
    </div>
  )
}
