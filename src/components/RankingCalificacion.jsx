// Ranking general de choferes por calificación (0-100), de mejor a peor.
// Estrellas + semáforo (misma fórmula del perfil). Filtros y orden por columna.
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, Search, RotateCcw, Trophy } from 'lucide-react'
import { useData } from '../DataContext'
import { calcularPagos, promediosFlota, calificarChofer } from '../utils/calc'
import { money, num } from '../utils/format'
import { Card, Input, Boton, Badge } from './ui'

const COLOR_NIVEL = { bueno: '#22c55e', regular: '#f59e0b', malo: '#ef4444' }
const BADGE_NIVEL = { bueno: 'green', regular: 'gold', malo: 'red' }

function Estrellas({ n }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={14} strokeWidth={1.8} className={i <= n ? 'fill-brand-gold text-brand-gold' : 'text-slate-300 dark:text-slate-600'} />
      ))}
    </span>
  )
}
function Semaforo({ nivel }) {
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: COLOR_NIVEL[nivel] }} />
}

export default function RankingCalificacion({ compacto = false, limite = 5 }) {
  const { facturaRango: inv, claims, drivers, selectedCity } = useData()
  const navigate = useNavigate()
  const [sortKey, setSortKey] = useState('puntaje')
  const [asc, setAsc] = useState(false)
  const [busca, setBusca] = useState('')
  const [fCat, setFCat] = useState('')

  const base = useMemo(() => {
    const pagos = calcularPagos(inv, claims, drivers, selectedCity)
    const prom = promediosFlota(pagos)
    return pagos.map((p) => {
      const paquetes = p.individuales + p.dobles
      return { ...p, paquetes, calif: calificarChofer({ ...p, paquetes }, prom) }
    })
  }, [inv, claims, drivers, selectedCity])

  const porPuntaje = useMemo(() => [...base].sort((a, b) => b.calif.puntaje - a.calif.puntaje), [base])
  const posMap = useMemo(() => new Map(porPuntaje.map((r, i) => [r.nombre, i + 1])), [porPuntaje])
  const n = base.length
  const conteo = useMemo(() => { const c = { bueno: 0, regular: 0, malo: 0 }; base.forEach((r) => (c[r.calif.nivel] += 1)); return c }, [base])

  const irPerfil = (nombre) => navigate(`/choferes/${encodeURIComponent(nombre)}`)

  // -------- versión compacta (top-N para Dashboard) --------
  if (compacto) {
    const top = porPuntaje.slice(0, limite)
    return (
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <Trophy size={18} strokeWidth={1.8} className="text-brand-gold" />
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Mejores choferes (calificación)</h3>
        </div>
        <ol className="m-0 space-y-1.5">
          {top.map((r, i) => (
            <li key={r.nombre} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-right text-slate-400">{i + 1}</span>
              <button onClick={() => irPerfil(r.nombre)} className="truncate font-medium text-brand-navy hover:underline dark:text-slate-100">{r.nombre}</button>
              <Estrellas n={r.calif.estrellas} />
              <span className="ml-auto inline-flex items-center gap-1.5"><Semaforo nivel={r.calif.nivel} /> {r.calif.puntaje}</span>
            </li>
          ))}
          {top.length === 0 && <li className="text-sm text-slate-400">Sin datos en el periodo.</li>}
        </ol>
      </Card>
    )
  }

  // -------- versión completa --------
  const filtradas = base.filter((r) => {
    if (busca && !r.nombre.toLowerCase().includes(busca.trim().toLowerCase())) return false
    if (fCat && r.calif.nivel !== fCat) return false
    return true
  })
  const val = (r, k) =>
    k === 'nombre' ? r.nombre : k === 'claims' ? r.claimsTotales : k === 'fallidos' ? (r.fallidos || 0) : k === 'ganancia' ? r.ganancia : k === 'paquetes' ? r.paquetes : r.calif.puntaje
  const rows = [...filtradas].sort((a, b) => {
    const va = val(a, sortKey), vb = val(b, sortKey)
    if (typeof va === 'string') return asc ? va.localeCompare(vb) : vb.localeCompare(va)
    return asc ? va - vb : vb - va
  })
  const cambiar = (k) => { if (sortKey === k) setAsc((v) => !v); else { setSortKey(k); setAsc(false) } }
  const flecha = (k) => (sortKey === k ? (asc ? ' ▲' : ' ▼') : '')

  const Pill = ({ v, children }) => (
    <button onClick={() => setFCat(fCat === v ? '' : v)} className={`rounded-full px-3 py-1 text-xs font-semibold transition ${fCat === v ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300'}`}>{children}</button>
  )

  return (
    <div>
      {/* Resumen por categoría */}
      <div className="mb-3 grid grid-cols-3 gap-3">
        {[['bueno', 'Buenos', 'green'], ['regular', 'Regulares', 'gold'], ['malo', 'Malos', 'red']].map(([k, label]) => (
          <Card key={k} className="flex items-center gap-3 p-4">
            <span className="h-3 w-3 rounded-full" style={{ background: COLOR_NIVEL[k] }} />
            <div>
              <div className="text-2xl font-bold text-brand-navy dark:text-slate-100">{num(conteo[k])}</div>
              <div className="text-xs text-slate-400">{label}</div>
            </div>
          </Card>
        ))}
      </div>

      {/* Filtros */}
      <Card className="mb-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} strokeWidth={1.8} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input className="w-52 pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar chofer…" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Categoría</span>
          <Pill v="bueno">Buenos</Pill>
          <Pill v="regular">Regulares</Pill>
          <Pill v="malo">Malos</Pill>
          {(busca || fCat) && <Boton variant="ghost" onClick={() => { setBusca(''); setFCat('') }} className="px-3 py-1.5 text-xs"><RotateCcw size={14} strokeWidth={2} /> Limpiar</Boton>}
          <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">{rows.length} de {n}</span>
        </div>
      </Card>

      <Card className="p-4">
        <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
          <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
            <thead>
              <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <th className="px-2.5 py-2.5 text-left font-semibold">#</th>
                <th className="cursor-pointer px-2.5 py-2.5 text-left font-semibold" onClick={() => cambiar('nombre')}>Chofer{flecha('nombre')}</th>
                <th className="px-2.5 py-2.5 text-left font-semibold">Estrellas</th>
                <th className="px-2.5 py-2.5 text-center font-semibold">Semáforo</th>
                <th className="cursor-pointer px-2.5 py-2.5 text-right font-semibold" onClick={() => cambiar('puntaje')}>Puntaje{flecha('puntaje')}</th>
                <th className="cursor-pointer px-2.5 py-2.5 text-right font-semibold" onClick={() => cambiar('paquetes')}>Paquetes{flecha('paquetes')}</th>
                <th className="cursor-pointer px-2.5 py-2.5 text-right font-semibold" onClick={() => cambiar('claims')}>Claims{flecha('claims')}</th>
                <th className="cursor-pointer px-2.5 py-2.5 text-right font-semibold" onClick={() => cambiar('fallidos')}>Fallidos{flecha('fallidos')}</th>
                <th className="cursor-pointer px-2.5 py-2.5 text-right font-semibold" onClick={() => cambiar('ganancia')}>Ganancia{flecha('ganancia')}</th>
                <th className="px-2.5 py-2.5 text-left font-semibold">Etiqueta</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pos = posMap.get(r.nombre)
                const esTop = pos <= 3
                const esBottom = n > 6 && pos > n - 3
                return (
                  <tr key={r.nombre} onClick={() => irPerfil(r.nombre)}
                    className={`cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30 ${esTop ? 'bg-emerald-50/50 dark:bg-emerald-500/5' : esBottom ? 'bg-rose-50/40 dark:bg-rose-500/5' : ''}`}>
                    <td className="px-2.5 py-2 font-semibold text-slate-400">{pos}{esTop && <Trophy size={12} strokeWidth={2} className="ml-1 inline text-brand-gold" />}</td>
                    <td className="px-2.5 py-2 font-medium text-brand-navy dark:text-slate-100">{r.nombre}{r.sinTarifa && <Badge color="red">sin tarifa</Badge>}</td>
                    <td className="px-2.5 py-2"><Estrellas n={r.calif.estrellas} /></td>
                    <td className="px-2.5 py-2 text-center"><Semaforo nivel={r.calif.nivel} /></td>
                    <td className="px-2.5 py-2 text-right font-bold" style={{ color: COLOR_NIVEL[r.calif.nivel] }}>{r.calif.puntaje}</td>
                    <td className="px-2.5 py-2 text-right">{num(r.paquetes)}</td>
                    <td className="px-2.5 py-2 text-right">{num(r.claimsTotales)}</td>
                    <td className={`px-2.5 py-2 text-right ${(r.fallidos || 0) > 0 ? 'font-medium text-amber-600 dark:text-amber-400' : 'text-slate-400'}`}>{num(r.fallidos || 0)}</td>
                    <td className={`px-2.5 py-2 text-right ${r.ganancia >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(r.ganancia)}</td>
                    <td className="px-2.5 py-2"><Badge color={BADGE_NIVEL[r.calif.nivel]}>{r.calif.etiqueta}</Badge></td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={10} className="px-3 py-6 text-center text-slate-400">Sin choferes con estos filtros.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">Estrellas: 90-100=5★, 75-89=4★, 60-74=3★, 40-59=2★, &lt;40=1★. Semáforo: verde ≥75, amarillo 50-74, rojo &lt;50.</p>
      </Card>
    </div>
  )
}
