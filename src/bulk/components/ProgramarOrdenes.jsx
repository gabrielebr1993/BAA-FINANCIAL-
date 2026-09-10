// ============================================================================
// BULK · PROGRAMAR ÓRDENES (staff) — modal del panel de escritorio.
// El admin/dispatcher crea, A NOMBRE DE UN CLIENTE, un pedido para una fecha
// (hoy o futura) o una REGLA RECURRENTE (L–V / días elegidos). Usa el MISMO
// backend que los pedidos del cliente:
//   · bulk_pedidos → bulkPedidoCliente lo convierte en órdenes reales (si la
//     fecha es futura queda 'programado' y se crea su día a las 00:05).
//   · bulk_recurringOrders → createRecurringOrders (00:05) crea las del día.
// Abajo se listan las reglas y los pedidos programados, con pausa/eliminación.
// ============================================================================
import { useMemo, useState } from 'react'
import { X, CalendarClock, Repeat, Trash2, Pause, Play } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, guardar, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { Card, Boton, Aviso, Badge } from '../../components/ui'
import { useLang } from '../../i18n'

const DIAS = [[1, 'L'], [2, 'M'], [3, 'Mi'], [4, 'J'], [5, 'V'], [6, 'S'], [0, 'D']]
const diasTxt = (ds) => (ds || []).slice().sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b)).map((d) => (DIAS.find(([n]) => n === d) || [0, '?'])[1]).join('·')
const hoyYmd = () => new Date().toLocaleDateString('en-CA')

export default function ProgramarOrdenes({ onClose }) {
  const { t } = useLang()
  const { tenantId, usuario } = useBulkAuth()
  const { datos: clientes } = useColeccion('clients')
  const { datos: jobs } = useColeccion('jobs')
  const { datos: pedidos } = useColeccion('pedidos')
  const { datos: reglas } = useColeccion('recurringOrders')

  const [clienteId, setClienteId] = useState('')
  const [jobId, setJobId] = useState('')
  const [material, setMaterial] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [repetir, setRepetir] = useState(false)
  const [fecha, setFecha] = useState(hoyYmd())
  const [dias, setDias] = useState([1, 2, 3, 4, 5])
  const [hora, setHora] = useState('')
  const [fin, setFin] = useState('')
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  const jobsCliente = useMemo(() => (jobs || []).filter((j) => j.clienteId === clienteId), [jobs, clienteId])
  const job = jobsCliente.find((j) => j.id === jobId) || null
  const materiales = job?.materiales?.length ? job.materiales : []

  const crearProgramada = async () => {
    setMsg(null)
    const ton = Number(cantidad)
    if (!clienteId || !job) return setMsg({ tipo: 'error', txt: t('Elige el cliente y el trabajo.') })
    if (!(ton > 0)) return setMsg({ tipo: 'error', txt: t('Escribe la cantidad en toneladas.') })
    const mat = material || materiales[0] || ''
    setOcupado(true)
    try {
      if (repetir) {
        if (!dias.length) return setMsg({ tipo: 'error', txt: t('Elige al menos un día.') })
        await crear('recurringOrders', tenantId, {
          clienteId, clienteNombre: (clientes || []).find((c) => c.id === clienteId)?.nombre || '',
          jobId: job.id, material: mat, cantidadTon: ton, destino: job.destino || '',
          dias, hora: hora || '', fin: fin || null, activa: true, pausada: false,
          creadoPor: usuario?.id || '', creadoPorRol: 'staff',
        })
        setMsg({ tipo: 'ok', txt: t('Regla creada. Las órdenes se generan solas cada día elegido a las 00:05.') })
      } else {
        await crear('pedidos', tenantId, {
          clienteId, jobId: job.id, material: mat, cantidadTon: ton,
          destino: job.destino || '', fecha: fecha || hoyYmd(), estado: 'pendiente',
          creadoPor: usuario?.id || '', creadoPorRol: 'staff',
        })
        setMsg({ tipo: 'ok', txt: (fecha || hoyYmd()) > hoyYmd() ? t('Pedido programado: sus órdenes se crean ese día a las 00:05.') : t('Pedido enviado: las órdenes aparecen en la cola en unos segundos.') })
      }
      setCantidad('')
    } catch (e) { setMsg({ tipo: 'error', txt: (e?.message || t('No se pudo guardar.')) }) }
    finally { setOcupado(false) }
  }

  const nombreCliente = (id) => (clientes || []).find((c) => c.id === id)?.nombre || id
  const programados = (pedidos || []).filter((p) => ['pendiente', 'programado'].includes(p.estado))
    .sort((a, b) => String(a.fecha || '').localeCompare(String(b.fecha || '')))

  const selCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-10" onClick={ocupado ? undefined : onClose}>
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <CalendarClock size={18} className="text-amber-500" />
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Órdenes programadas y recurrentes')}</h3>
          <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>

        {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

        {/* ── Nueva programación ── */}
        <Card className="mb-4 p-4">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setJobId(''); setMaterial('') }} className={selCls}>
              <option value="">{t('Cliente…')}</option>
              {(clientes || []).map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            <select value={jobId} onChange={(e) => { setJobId(e.target.value); setMaterial('') }} disabled={!clienteId} className={selCls}>
              <option value="">{t('Trabajo…')}</option>
              {jobsCliente.map((j) => <option key={j.id} value={j.id}>{j.codigo || ''} · {j.nombre || j.destino || j.id}</option>)}
            </select>
            <select value={material} onChange={(e) => setMaterial(e.target.value)} disabled={!job} className={selCls}>
              <option value="">{materiales.length ? t('Material…') : t('(el del trabajo)')}</option>
              {materiales.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <input type="number" min="1" inputMode="decimal" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder={t('Toneladas (ej. 44)')} className={selCls} />
          </div>

          {/* Una vez / recurrente */}
          <div className="mt-3 flex items-center gap-2">
            <button type="button" onClick={() => setRepetir(false)} className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${!repetir ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{t('Una fecha')}</button>
            <button type="button" onClick={() => setRepetir(true)} className={`inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${repetir ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}><Repeat size={12} /> {t('Repetir cada…')}</button>
          </div>

          {!repetir ? (
            <div className="mt-3">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('Fecha')}</label>
              <input type="date" value={fecha} min={hoyYmd()} onChange={(e) => setFecha(e.target.value)} className={selCls + ' sm:w-56'} />
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {DIAS.map(([d, etq]) => {
                  const on = dias.includes(d)
                  return (
                    <button key={d} type="button" onClick={() => setDias(on ? dias.filter((x) => x !== d) : [...dias, d])}
                      className={`grid h-9 w-9 place-items-center rounded-full text-xs font-bold transition ${on ? 'bg-amber-500 text-slate-900' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>{etq}</button>
                  )
                })}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div><label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('Hora (opcional)')}</label><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={selCls} /></div>
                <div><label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('Hasta (opcional)')}</label><input type="date" value={fin} min={hoyYmd()} onChange={(e) => setFin(e.target.value)} className={selCls} /></div>
              </div>
              <p className="text-[11px] text-slate-400">{t('El pedido se crea solo cada día elegido a las 00:05.')}</p>
            </div>
          )}

          <Boton variant="gold" onClick={crearProgramada} disabled={ocupado} className="mt-4 w-full sm:w-auto">
            {repetir ? t('Crear regla recurrente') : t('Programar pedido')}
          </Boton>
        </Card>

        {/* ── Reglas recurrentes vigentes ── */}
        {(reglas || []).length > 0 && (
          <div className="mb-4">
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Recurrentes')}</div>
            <div className="space-y-1.5">
              {(reglas || []).map((r) => (
                <div key={r.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  <Repeat size={14} className="flex-shrink-0 text-amber-500" />
                  <span className="min-w-0 flex-1 truncate">
                    <b>{r.material || t('Material')}</b> · {r.cantidadTon} ton · {diasTxt(r.dias)}{r.hora ? ` · ${r.hora}` : ''} · {r.clienteNombre || nombreCliente(r.clienteId)}{r.fin ? ` · ${t('hasta')} ${r.fin}` : ''}
                  </span>
                  <Badge color={r.pausada ? 'slate' : 'green'}>{r.pausada ? t('Pausada') : t('Activa')}</Badge>
                  <button title={r.pausada ? t('Reanudar') : t('Pausar')} onClick={() => guardar('recurringOrders', r.id, { pausada: !r.pausada })} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">{r.pausada ? <Play size={15} /> : <Pause size={15} />}</button>
                  <button title={t('Eliminar')} onClick={() => window.confirm(t('¿Eliminar esta regla recurrente?')) && eliminar('recurringOrders', r.id)} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Pedidos programados pendientes ── */}
        {programados.length > 0 && (
          <div>
            <div className="mb-1.5 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Programados')}</div>
            <div className="space-y-1.5">
              {programados.map((p) => (
                <div key={p.id} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                  <CalendarClock size={14} className="flex-shrink-0 text-sky-500" />
                  <span className="min-w-0 flex-1 truncate"><b>{p.fecha}</b> · {p.material || t('Material')} · {p.cantidadTon} ton · {nombreCliente(p.clienteId)}</span>
                  <button title={t('Eliminar')} onClick={() => window.confirm(t('¿Eliminar este pedido?')) && eliminar('pedidos', p.id)} className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
