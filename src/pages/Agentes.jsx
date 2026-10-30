// ============================================================================
// Agentes — mapa interactivo en vivo (MilePay, módulo Gofo)
// ----------------------------------------------------------------------------
// Opción del menú debajo de "Verificación". Muestra en vivo qué están
// haciendo los agentes por ciudad: MilePay en el centro, Gofo a un lado,
// y una línea / camino por cada ciudad con un punto animado que se mueve
// entre Gofo y MilePay mientras ese agente trabaja.
// Datos REALES, no inventados: lee en tiempo real (onSnapshot)
//  * podVerifications (empresa activa, carrier gofo): cuántas entregas
//    ya están en MilePay por ciudad, cuántas verificadas y cuántas en
//    revisión humana.
//  * settings/{companyId}.analisisPodHoySitios: entregadas, en progreso,
//    calificadas y porcentaje por ciudad, cuando el trabajo por ciudades
//    lo escribe. Si una ciudad no tiene datos, su agente se muestra
//    "sin datos todavía", nunca con un % inventado.
// Un agente se muestra "trabajando" cuando su ciudad tiene entregadas
// sin calificar (calificadas < entregadas) o cuando su porcentaje es
// < 100; en otro caso se muestra "sin pendientes". No se toca pago,
// claims, facturas ni datos de choferes. Solo lectura.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { Bot } from 'lucide-react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { Card, PageTitle } from '../components/ui'
import { useCarrier } from '../carriers/CarrierContext'

export const SITIOS_GOFO = [
  'DFW-BAA', 'AUS-BAA', 'IAH-BAA', 'MSN-BAA', 'ORD-BAA', 'ABI-BAA',
  'IAH02-BAA', 'DFW02-BAA', 'AUS02-BAA', 'ORD02-BAA', 'LCH-BAA',
]

// Posiciones del mapa (vista 1000x560): MilePay al centro, Gofo a la
// derecha, cada ciudad-agente a la izquierda, en dos columnas.
const POS = {
  'DFW-BAA': [120, 70], 'AUS-BAA': [120, 140], 'IAH-BAA': [120, 210],
  'MSN-BAA': [120, 280], 'ORD-BAA': [120, 350], 'ABI-BAA': [120, 420],
  'IAH02-BAA': [120, 490], 'DFW02-BAA': [300, 70], 'AUS02-BAA': [300, 140],
  'ORD02-BAA': [300, 210], 'LCH-BAA': [300, 280],
}
const MILEPAY = [500, 280]
const GOFO = [880, 280]

export default function Agentes() {
  const { companyId: companyIdPerfil } = useAuth()
  const { activeCompanyId, ajustes } = useData()
  const { carrier } = useCarrier()
  const companyId = activeCompanyId || companyIdPerfil
  const [reales, setReales] = useState([])
  const [progresoSitios, setProgresoSitios] = useState(null)

  useEffect(() => {
    if (!companyId || carrier !== 'gofo') return undefined
    const unsub = onSnapshot(
      query(collection(db, 'podVerifications'), where('companyId', '==', companyId)),
      (snap) => {
        const soloGofo = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .filter((e) => !e.carrier || e.carrier === 'gofo')
        setReales(soloGofo)
      },
      () => {},
    )
    return () => unsub()
  }, [companyId, carrier])

  useEffect(() => {
    if (!companyId) return undefined
    return onSnapshot(doc(db, 'settings', companyId), (snap) => {
      setProgresoSitios(snap.exists() ? (snap.data()?.analisisPodHoySitios || null) : null)
    }, () => {})
  }, [companyId])

  const porSitio = useMemo(() => {
    const c = {}
    reales.forEach((e) => {
      const s = e.site || e.sitio
      if (!s) return
      c[s] = c[s] || { enMilePay: 0, verificadas: 0, enRevision: 0 }
      c[s].enMilePay += 1
      if (e.revision === 'confirmado') c[s].verificadas += 1
      else if (e.revision === 'revision') c[s].enRevision += 1
    })
    return c
  }, [reales])

  const agentes = SITIOS_GOFO.map((s, i) => {
    const p = progresoSitios?.[s] || ajustes?.analisisPodHoySitios?.[s] || null
    const m = porSitio[s] || { enMilePay: 0, verificadas: 0, enRevision: 0 }
    const entregadas = typeof p?.entregadas === 'number' ? p.entregadas : null
    const calificadas = typeof p?.calificadas === 'number' ? p.calificadas : m.enMilePay
    const pct = typeof p?.porcentaje === 'number' ? Math.max(0, Math.min(100, p.porcentaje)) : null
    const trabajando = p ? (entregadas === null || calificadas < entregadas || (pct !== null && pct < 100)) : false
    return { sitio: s, i, p, m, entregadas, calificadas, pct, trabajando }
  })
  const trabajandoCount = agentes.filter((a) => a.trabajando).length

  return (
    <div>
      <PageTitle titulo="Agentes en vivo" subtitulo="Mapa interactivo: Gofo → agentes por ciudad → MilePay. Los puntos se mueven solo en las ciudades que están trabajando; los números son reales, en tiempo real, sin recargar." />
      <Card className="mb-5 p-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          <strong>{trabajandoCount} de 11 agentes trabajando</strong> · {reales.length} entregas en MilePay en total · MilePay en el centro, Gofo a la derecha, cada agente a la izquierda con su camino.
        </p>
        <svg viewBox="0 0 1000 560" className="mt-3 w-full rounded-xl bg-slate-50 dark:bg-slate-900" role="img" aria-label="Mapa de agentes entre Gofo y MilePay">
          {/* Caminos Gofo -> MilePay y ciudad -> MilePay */}
          {agentes.map((a) => {
            const [x, y] = POS[a.sitio]
            return (
              <g key={a.sitio}>
                <path d={`M ${x + 40} ${y} Q 400 ${y} ${MILEPAY[0] - 60} ${MILEPAY[1]}`} fill="none" stroke={a.trabajando ? '#0ea5e9' : '#cbd5e1'} strokeWidth={a.trabajando ? 3 : 1.5} strokeDasharray={a.trabajando ? '0' : '6 6'} />
                <path d={`M ${MILEPAY[0] + 60} ${MILEPAY[1]} Q 700 ${MILEPAY[1]} ${GOFO[0] - 60} ${GOFO[1]}`} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="6 6" />
                {a.trabajando && (
                  <circle r="7" fill="#0ea5e9">
                    <animateMotion dur={`${4 + (a.i % 5)}s`} repeatCount="indefinite" path={`M ${x + 40} ${y} Q 400 ${y} ${MILEPAY[0] - 60} ${MILEPAY[1]}`} />
                  </circle>
                )}
                <g>
                  <rect x={x - 10} y={y - 16} width="110" height="32" rx="8" fill={a.trabajando ? '#e0f2fe' : '#f1f5f9'} stroke={a.trabajando ? '#0ea5e9' : '#cbd5e1'} />
                  <text x={x + 45} y={y + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">{a.sitio}</text>
                </g>
              </g>
            )
          })}
          {/* Nodos MilePay y Gofo */}
          <g>
            <rect x={MILEPAY[0] - 70} y={MILEPAY[1] - 40} width="140" height="80" rx="14" fill="#0f172a" />
            <text x={MILEPAY[0]} y={MILEPAY[1] - 5} textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">MilePay</text>
            <text x={MILEPAY[0]} y={MILEPAY[1] + 20} textAnchor="middle" fontSize="12" fill="#bae6fd">en el centro</text>
          </g>
          <g>
            <rect x={GOFO[0] - 70} y={GOFO[1] - 40} width="140" height="80" rx="14" fill="#059669" />
            <text x={GOFO[0]} y={GOFO[1] - 5} textAnchor="middle" fontSize="16" fontWeight="800" fill="#fff">Gofo</text>
            <text x={GOFO[0]} y={GOFO[1] + 20} textAnchor="middle" fontSize="12" fill="#d1fae5">portal, solo consulta</text>
          </g>
        </svg>
        <p className="mt-2 text-xs text-slate-500">Leyenda: punto azul moviéndose = agente trabajando en esa ciudad. Línea gris punteada = ciudad sin datos todavía o sin pendientes. Toca una ciudad abajo para ver sus números.</p>
      </Card>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {agentes.map((a) => (
          <Card key={a.sitio} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-bold"><Bot size={18} /> {a.sitio}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.trabajando ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>{a.trabajando ? 'Trabajando' : (a.p ? 'Sin pendientes' : 'Sin datos todavía')}</span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div className="h-full rounded-full bg-sky-500" style={{ width: `${a.pct ?? 0}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {a.p ? `${a.p.estado || 'En curso'} · ${a.pct ?? 0}%` : 'Sin avance reportado todavía'}
              {a.entregadas !== null ? ` · ${a.entregadas} entregadas` : ''}
              {typeof a.p?.enProgreso === 'number' ? ` · ${a.p.enProgreso} en progreso` : ''}
              {` · ${a.m.enMilePay} en MilePay (${a.m.verificadas} verificadas, ${a.m.enRevision} en revisión)`}
            </p>
          </Card>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">Nota: los agentes que ves aquí son los trabajos por ciudad en Gofo/MilePay. No se crea una entrega dos veces: cada guía tiene un solo documento en MilePay y los agentes saltan las guías ya escritas.</p>
    </div>
  )
}
