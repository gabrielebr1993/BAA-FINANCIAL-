// Tarjeta de vista previa de un módulo (datos de EJEMPLO). Dos formas:
//   · invoice → factura "Invoice · Week 46" con tabla y "Difference $0.00".
//   · board   → 3 KPIs + 3 filas con estado.
// Borde superior de 4px con el color del módulo. Usada en inicio y login.
import { tx } from '../config/modules'

const TONE = {
  ok: { bg: '#EAF2FF', fg: '#2563EB' },
  progress: { bg: '#FFF5DB', fg: '#B47400' },
  done: { bg: '#E4F8EF', fg: '#1F8F63' },
}

export default function ModulePreview({ module: m, lang = 'en', compact = false, sampleLabel = 'Sample data' }) {
  const p = m.preview
  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-[0_18px_50px_-12px_rgba(5,18,40,0.45)]" style={{ borderTop: `4px solid ${m.strong}` }}>
      <div className={compact ? 'p-4' : 'p-5'}>
        <div className="mb-3 flex items-center justify-between">
          <span className="font-display text-sm font-bold text-rd-ink">
            {p.type === 'invoice' ? tx(p.title, lang) : tx(m.name, lang)}
          </span>
          <span className="rounded-full bg-rd-bg px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-rd-ink-sub">{sampleLabel}</span>
        </div>

        {p.type === 'invoice' ? (
          <div>
            {p.rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between border-b border-rd-line py-2 text-sm last:border-0">
                <span className="text-rd-ink-sub">{tx(r.label, lang)}</span>
                <span className="font-mono font-semibold text-rd-ink">{r.value}</span>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between rounded-xl bg-rd-parcel-soft px-3 py-2.5">
              <span className="text-sm font-semibold text-rd-ink">{tx(p.footer.label, lang)}</span>
              <span className="font-mono text-base font-extrabold" style={{ color: m.strong }}>{p.footer.value}</span>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-3 grid grid-cols-3 gap-2">
              {p.kpis.map((k, i) => (
                <div key={i} className="rounded-xl bg-rd-bg px-2.5 py-2 text-center">
                  <div className="font-mono text-[15px] font-extrabold text-rd-ink">{k.value}</div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wide text-rd-ink-sub">{tx(k.label, lang)}</div>
                </div>
              ))}
            </div>
            {p.rows.map((r, i) => {
              const tone = TONE[r.tone] || TONE.ok
              return (
                <div key={i} className="flex items-center justify-between border-b border-rd-line py-2 text-sm last:border-0">
                  <span className="truncate pr-2 text-rd-ink">{tx(r.name, lang)}</span>
                  <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>{tx(r.status, lang)}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
