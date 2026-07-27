import { useState } from 'react'
import { FlaskConical, Database, Trash2, Loader2, ShieldCheck, ArrowRight } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { useBulkAuth } from '../BulkAuthContext'
import { sembrarDemo, borrarDemo, hayDemo } from '../data/demo'
import { PageTitle, Card, Boton, Aviso } from '../../components/ui'

export default function ModoTest() {
  const { tenantId } = useBulkAuth()
  const { datos: ordenes } = useColeccion('orders')
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: facturas } = useColeccion('invoices')
  const { datos: incidencias } = useColeccion('incidents')

  const [fase, setFase] = useState('idle') // idle | sembrando | borrando
  const [log, setLog] = useState([])
  const [msg, setMsg] = useState(null)
  const ocupado = fase !== 'idle'

  const demoOrdenes = ordenes.filter((o) => o.demo).length

  const cargar = async () => {
    const yaHay = await hayDemo(tenantId)
    if (yaHay > 0 && !window.confirm(`Ya hay ${yaHay} órdenes de prueba. ¿Cargar OTRO paquete de datos encima? (puedes borrar todo después)`)) return
    setFase('sembrando'); setLog([]); setMsg(null)
    try {
      const resumen = await sembrarDemo(tenantId, (m) => setLog((l) => [...l, m]))
      const t = Object.entries(resumen).map(([k, v]) => `${v} ${k}`).join(' · ')
      setMsg({ tipo: 'ok', txt: `Datos de demostración cargados: ${t}. Recorre el menú para verlo todo funcionando.` })
    } catch (e) {
      setMsg({ tipo: 'error', txt: 'No se pudieron cargar los datos: ' + e.message })
    } finally { setFase('idle') }
  }

  const borrar = async () => {
    if (!window.confirm('Esto borra SOLO los datos de prueba (marcados como demo). Tus datos reales no se tocan. ¿Continuar?')) return
    setFase('borrando'); setLog([]); setMsg(null)
    try {
      const n = await borrarDemo(tenantId, (m) => setLog((l) => [...l, m]))
      setMsg({ tipo: 'ok', txt: `Se borraron ${n} documentos de prueba.` })
    } catch (e) {
      setMsg({ tipo: 'error', txt: 'No se pudieron borrar: ' + e.message })
    } finally { setFase('idle') }
  }

  return (
    <div>
      <PageTitle>Modo test</PageTitle>

      <Card className="mb-4 p-5">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-500"><FlaskConical size={22} /></div>
          <div className="min-w-0">
            <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Datos de demostración</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Carga un negocio completo de ejemplo —clientes, plantas, transportistas, tarifas, trabajos y unas 50 órdenes en todas
              las etapas (en cola, en ruta y entregadas)— para ver el sistema funcionando de punta a punta: Dashboard, Órdenes, Mapa
              en vivo, Facturación, Documentos e Incidencias.
            </p>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
              <ShieldCheck size={14} /> Todo se marca como prueba. El botón de borrar elimina solo eso; tus datos reales nunca se tocan.
            </div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Boton variant="gold" onClick={cargar} disabled={ocupado}>
            {fase === 'sembrando' ? <><Loader2 size={16} className="animate-spin" /> Cargando…</> : <><Database size={16} /> Cargar datos de demostración</>}
          </Boton>
          <Boton variant="danger" onClick={borrar} disabled={ocupado}>
            {fase === 'borrando' ? <><Loader2 size={16} className="animate-spin" /> Borrando…</> : <><Trash2 size={16} /> Borrar datos de prueba</>}
          </Boton>
        </div>

        {msg && <Aviso tipo={msg.tipo} className="mt-4">{msg.txt}</Aviso>}
      </Card>

      {/* Resumen de lo que hay ahora mismo */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        <Mini label="Órdenes" valor={ordenes.length} nota={demoOrdenes ? `${demoOrdenes} demo` : null} />
        <Mini label="Clientes" valor={clientes.length} />
        <Mini label="Transportistas" valor={carriers.length} />
        <Mini label="Facturas" valor={facturas.length} />
        <Mini label="Incidencias" valor={incidencias.length} />
      </div>

      {log.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 text-xs font-semibold uppercase text-slate-400">Progreso</div>
          <div className="scroll-thin max-h-52 overflow-y-auto rounded-lg bg-slate-950/90 p-3 font-mono text-xs text-emerald-300">
            {log.map((l, i) => <div key={i}>› {l}</div>)}
          </div>
        </Card>
      )}

      {demoOrdenes > 0 && !ocupado && (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
          <ArrowRight size={15} className="text-amber-500" /> Ve al <b className="mx-1">Dashboard</b> o a <b className="mx-1">Mapa en vivo</b> para ver los datos en acción.
        </p>
      )}
    </div>
  )
}

function Mini({ label, valor, nota }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700/60 dark:bg-slate-900">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-xl font-black text-brand-navy dark:text-slate-100">{valor}</div>
      {nota && <div className="text-[10px] text-amber-500">{nota}</div>}
    </div>
  )
}
