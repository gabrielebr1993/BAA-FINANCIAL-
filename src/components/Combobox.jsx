// Combobox ligero con buscador (autocomplete). Filtra ignorando mayúsculas y
// acentos; se navega con teclado (↑/↓/Enter/Esc) o con el ratón. Estilo Mercury.
//   options: [{ value, label, hint? }]
import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Check, Search, X } from 'lucide-react'

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Combobox({ value, onChange, options = [], placeholder = 'Elegir…', searchPlaceholder = 'Escribe para buscar…', className = '', disabled = false }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const ref = useRef(null)
  const inputRef = useRef(null)

  const selected = options.find((o) => o.value === value) || null
  const filtered = useMemo(() => {
    const nq = norm(q.trim())
    if (!nq) return options
    return options.filter((o) => norm(o.label).includes(nq) || (o.hint && norm(o.hint).includes(nq)))
  }, [options, q])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  useEffect(() => { if (open) { setQ(''); setHi(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [open])
  useEffect(() => { setHi(0) }, [q])

  const pick = (o) => { onChange(o.value); setOpen(false) }
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) pick(filtered[hi]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition ${open ? 'border-brand-gold' : 'border-slate-300 dark:border-slate-600'} bg-white disabled:opacity-50 dark:bg-slate-800 dark:text-slate-100`}
      >
        <span className={`flex-1 truncate ${selected ? '' : 'text-slate-400'}`}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={15} strokeWidth={1.8} className={`flex-shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full min-w-[240px] rounded-lg border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center gap-1.5 border-b border-slate-100 px-2.5 py-1.5 dark:border-slate-700">
            <Search size={14} strokeWidth={1.8} className="flex-shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKey}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400 dark:text-slate-100"
            />
            {q && <button type="button" onClick={() => setQ('')} className="flex-shrink-0"><X size={13} strokeWidth={2} className="text-slate-400" /></button>}
          </div>
          <div className="scroll-thin max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-slate-400">Sin coincidencias.</div>}
            {filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onMouseEnter={() => setHi(i)}
                onClick={() => pick(o)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${i === hi ? 'bg-brand-gold/10' : ''} ${o.value === value ? 'font-semibold text-brand-navy dark:text-brand-gold' : 'text-slate-700 dark:text-slate-200'}`}
              >
                {o.value === value ? <Check size={14} strokeWidth={2} className="flex-shrink-0 text-brand-gold" /> : <span className="w-[14px] flex-shrink-0" />}
                <span className="flex-1 truncate">{o.label}</span>
                {o.hint && <span className="flex-shrink-0 text-xs text-slate-400">{o.hint}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
