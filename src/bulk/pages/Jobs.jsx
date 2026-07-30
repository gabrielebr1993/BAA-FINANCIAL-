import { useState } from 'react'
import { Plus, Layers, Trash2, Wand2, Truck, Check, AlertTriangle } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, eliminar, crearLote, listar, guardar, where } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { generarOrdenesDeJob, contarViajes } from '../domain/ordenes'
import { calcularTarifa } from '../domain/tarifas'
import { MAX_TON_POR_VIAJE, ORDEN_ESTADO as E } from '../domain/constants'

const EN_COLA = [E.CREADA, E.EN_COLA, E.NOTIFICANDO]
const EN_PROCESO = [E.ACEPTADA, E.EN_PLANTA, E.CARGANDO, E.EN_RUTA, E.EN_DESTINO]
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, EstadoVacio, Aviso, Spinner } from '../../components/ui'
import { useLang } from '../../i18n'

export default function Jobs() {
  const { t } = useLang()
  const { tenantId, usuario, rol } = useBulkAuth()
  const { datos: jobs, cargando } = useColeccion('jobs')
  const { datos: clientes } = useColeccion('clients')
  const { datos: plantas } = useColeccion('plants')
  const { datos: materiales } = useColeccion('materials')
  const { datos: equipos } = useColeccion('equipment')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: ordenes } = useColeccion('orders')
  const conteoJob = (id) => {
    const os = ordenes.filter((o) => o.jobId === id)
    return { cola: os.filter((o) => EN_COLA.includes(o.estado)).length, proceso: os.filter((o) => EN_PROCESO.includes(o.estado)).length }
  }

  const [f, setF] = useState({ nombre: '', clienteId: '', plantaId: '', tipoEquipo: '', materiales: [], transportistas: [], destino: '', po: '' })
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const plantasCliente = plantas.filter((p) => p.clienteId === f.clienteId)
  const toggleArr = (k, v) => setF((s) => ({ ...s, [k]: s[k].includes(v) ? s[k].filter((x) => x !== v) : [...s[k], v] }))

  const crearJob = async () => {
    if (!f.nombre.trim() || !f.clienteId) { setMsg({ tipo: 'warn', txt: t('Nombre y cliente son obligatorios.') }); return }
    const codigo = `J${Date.now().toString(36).toUpperCase().slice(-5)}`
    // Si no escribió PO, toma el de la oferta de la planta para el primer material.
    const plantaSel = plantas.find((p) => p.id === f.plantaId)
    const oferta = (plantaSel?.ofertas || []).find((o) => o.material === f.materiales[0])
    await crear('jobs', tenantId, {
      codigo, nombre: f.nombre.trim(), clienteId: f.clienteId, plantaId: f.plantaId,
      tipoEquipo: f.tipoEquipo, materiales: f.materiales, transportistasAutorizados: f.transportistas,
      destino: f.destino.trim(), po: f.po.trim() || oferta?.po || '', activo: true,
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'crear', entidad: 'job', detalle: `Job ${codigo} · ${f.nombre}` })
    setF({ nombre: '', clienteId: '', plantaId: '', tipoEquipo: '', materiales: [], transportistas: [], destino: '', po: '' })
    setMsg({ tipo: 'ok', txt: `${t('Trabajo')} ${codigo} ${t('creado.')}` })
  }

  if (cargando) return <Cargando />
  const nombreCliente = (id) => clientes.find((c) => c.id === id)?.nombre || '—'

  return (
    <div>
      <PageTitle>{t('Trabajos (Jobs)')}</PageTitle>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo trabajo')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder={t('Nombre del trabajo')} value={f.nombre} onChange={set('nombre')} />
          <Select value={f.clienteId} onChange={(e) => setF((s) => ({ ...s, clienteId: e.target.value, plantaId: '' }))}>
            <option value="">{t('— Cliente —')}</option>
            {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </Select>
          <Select value={f.plantaId} onChange={set('plantaId')} disabled={!f.clienteId}>
            <option value="">{t('— Planta —')}</option>
            {plantasCliente.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </Select>
          <Select value={f.tipoEquipo} onChange={set('tipoEquipo')}>
            <option value="">{t('— Tipo de equipo requerido —')}</option>
            {equipos.filter((e) => e.activo !== false).map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
          </Select>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('Dirección de entrega')} <span className="normal-case text-slate-400">{t('(lo que ve el driver en la app)')}</span></div>
            <Input placeholder={t('Ej. 4500 Bayway Dr, Baytown, TX')} value={f.destino} onChange={set('destino')} />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('PO / orden de compra')}</div>
            <Input placeholder={t('Auto de la planta si vacío')} value={f.po} onChange={set('po')} />
          </div>
        </div>
        {(() => {
          const ps = plantas.find((p) => p.id === f.plantaId)
          const ofs = ps?.ofertas || []
          return ofs.length > 0 ? (
            <div className="mt-2 rounded-lg bg-slate-50 p-2 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
              <span className="font-semibold">{t('Ofrece')} {ps.nombre}:</span> {ofs.map((o) => `${o.material}${o.precio ? ` · $${o.precio}` : ''}${o.po ? ` · PO ${o.po}` : ''}`).join('  |  ')}
            </div>
          ) : null
        })()}
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('Materiales permitidos')}</div>
            <div className="flex flex-wrap gap-1.5">
              {materiales.filter((m) => m.activo !== false).map((m) => (
                <button key={m.id} type="button" onClick={() => toggleArr('materiales', m.nombre)} className={`rounded-lg border px-2.5 py-1 text-xs ${f.materiales.includes(m.nombre) ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>{t(m.nombre)}</button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold uppercase text-slate-400">{t('Transportistas autorizados')} {f.tipoEquipo && <span className="normal-case text-slate-400">({t('solo compatibles con')} {f.tipoEquipo})</span>}</div>
            <div className="flex flex-wrap gap-1.5">
              {carriers.filter((c) => !f.tipoEquipo || (c.equipos || []).map((x) => x.toLowerCase()).includes(f.tipoEquipo.toLowerCase())).map((c) => (
                <button key={c.id} type="button" onClick={() => toggleArr('transportistas', c.id)} className={`rounded-lg border px-2.5 py-1 text-xs ${f.transportistas.includes(c.id) ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>{c.nombre}</button>
              ))}
              {f.tipoEquipo && carriers.filter((c) => (c.equipos || []).map((x) => x.toLowerCase()).includes(f.tipoEquipo.toLowerCase())).length === 0 && <span className="text-xs text-rose-500">{t('Ningún transportista tiene ese equipo.')}</span>}
            </div>
          </div>
        </div>
        <div className="mt-3"><Boton variant="gold" onClick={crearJob}><Plus size={16} /> {t('Crear trabajo')}</Boton></div>
      </Card>

      {jobs.length === 0 ? <EstadoVacio titulo={t('Sin trabajos')} texto={t('Crea el primero arriba.')} mostrarBoton={false} /> : (
        <div className="space-y-3">
          {jobs.map((j) => <JobCard key={j.id} job={j} carriers={carriers} conteo={conteoJob(j.id)} nombreCliente={nombreCliente} tenantId={tenantId} usuario={usuario} rol={rol} />)}
        </div>
      )}
    </div>
  )
}

function JobCard({ job, carriers = [], conteo = { cola: 0, proceso: 0 }, nombreCliente, tenantId, usuario, rol }) {
  const { t } = useLang()
  const { datos: reglas } = useColeccion('tariffs')
  const [cant, setCant] = useState('')
  const [material, setMaterial] = useState((job.materiales || [])[0] || '')
  const [precioCliente, setPrecioCliente] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [res, setRes] = useState(null)
  const viajes = cant ? contarViajes(cant) : 0
  const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

  // Transportistas AUTORIZADOS de este trabajo (quiénes —y sus choferes— reciben
  // sus órdenes). Editable: agrega otro transporte si el actual no da abasto.
  const autorizados = job.transportistasAutorizados || []
  const esCompatible = (c) => !job.tipoEquipo || (c.equipos || []).map((x) => x.toLowerCase()).includes((job.tipoEquipo || '').toLowerCase())
  const toggleAut = async (cid) => {
    const nuevos = autorizados.includes(cid) ? autorizados.filter((x) => x !== cid) : [...autorizados, cid]
    await guardar('jobs', job.id, { transportistasAutorizados: nuevos })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'autorizar_transporte', entidad: 'job', entidadId: job.id, detalle: `${carriers.find((c) => c.id === cid)?.nombre || cid}: ${autorizados.includes(cid) ? 'quitado' : 'agregado'}` })
  }

  const generar = async () => {
    const total = Number(cant) || 0
    if (total <= 0) return
    setOcupado(true); setRes(null)
    // Continúa la numeración desde las órdenes existentes del job.
    const existentes = await listar('orders', tenantId, [where('jobId', '==', job.id)])
    const nuevas = generarOrdenesDeJob(job, total, { material, seqInicial: existentes.length + 1 })
    // Precio: manual (override) o AUTOMÁTICO con el motor de tarifas, por cada orden.
    const manual = precioCliente ? Number(precioCliente) : null
    let conTarifa = 0
    const conPrecio = nuevas.map((o) => {
      if (manual != null) return { ...o, precioCliente: manual, precioTransportista: r2(manual * 0.72), pagoChofer: r2(manual * 0.72 * 0.8) }
      const t = calcularTarifa(reglas, { material: o.material, tipoEquipo: job.tipoEquipo, clienteId: job.clienteId, plantaId: job.plantaId, ton: o.pesoEstimado })
      if (t) { conTarifa++; return { ...o, precioCliente: t.precioCliente, precioTransportista: t.precioTransportista, pagoChofer: t.pagoChofer } }
      return o
    })
    await crearLote('orders', tenantId, conPrecio)
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'generar_ordenes', entidad: 'job', entidadId: job.id, detalle: `${nuevas.length} órdenes (${total} ton) para ${job.codigo}` })
    setRes({ n: nuevas.length, total, tarifa: manual != null ? 'manual' : (conTarifa ? 'auto' : 'sin_tarifa') }); setCant(''); setOcupado(false)
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Layers size={17} className="text-amber-500" />
        <span className="font-bold text-brand-navy dark:text-slate-100">{job.nombre}</span>
        <Badge color="slate">{job.codigo}</Badge>
        <span className="text-xs text-slate-400">{t('Cliente')}: {nombreCliente(job.clienteId)}</span>
        {job.tipoEquipo && <Badge color="navy">{t('Equipo:')} {job.tipoEquipo}</Badge>}
        <span className="text-xs text-slate-400">· {conteo.cola} {t('en cola')} · {conteo.proceso} {t('en proceso')}</span>
        <button onClick={() => window.confirm(`${t('¿Eliminar trabajo')} "${job.nombre}"${t('? (no borra órdenes ya generadas)')}`) && eliminar('jobs', job.id)} className="ml-auto text-rose-400 hover:text-rose-600"><Trash2 size={15} /></button>
      </div>
      {(job.materiales || []).length > 0 && <div className="mt-1.5 flex flex-wrap gap-1">{job.materiales.map((m) => <Badge key={m} color="green">{t(m)}</Badge>)}</div>}

      {/* Transportistas autorizados (el FILTRO de quién recibe las órdenes) */}
      <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-slate-500 dark:text-slate-300">
          <Truck size={13} className="text-amber-500" /> {t('Transportistas autorizados')} ({autorizados.length})
        </div>
        <div className="flex flex-wrap gap-1.5">
          {carriers.length === 0 ? <span className="text-xs text-slate-400">{t('Crea transportistas primero en Transportistas.')}</span> : carriers.map((c) => {
            const on = autorizados.includes(c.id)
            const compat = esCompatible(c)
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleAut(c.id)}
                title={compat ? (on ? t('Quitar del trabajo') : t('Agregar al trabajo')) : `${t('Sin el equipo')} ${job.tipoEquipo} — ${t('no recibirá órdenes hasta agregárselo en Transportistas.')}`}
                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs transition ${on
                  ? (compat ? 'border-amber-500 bg-amber-500/15 font-semibold text-amber-700 dark:text-amber-300' : 'border-rose-400 bg-rose-50 font-semibold text-rose-600 dark:bg-rose-500/10 dark:text-rose-300')
                  : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
              >
                {on ? <Check size={12} /> : <Plus size={12} />} {c.nombre} {!compat && <AlertTriangle size={11} className="text-rose-500" />}
              </button>
            )
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400">{t('Toca para agregar o quitar. Solo estos transportistas (y sus choferes) reciben las órdenes de este trabajo; agrega otro si el actual no da abasto. Los marcados en rojo no tienen el equipo del trabajo y no recibirán órdenes hasta dárselo en Transportistas.')}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">{t('Cantidad (ton)')}</div>
          <Input type="number" className="w-28" placeholder="500" value={cant} onChange={(e) => setCant(e.target.value)} />
        </div>
        {(job.materiales || []).length > 1 && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">{t('Material')}</div>
            <Select value={material} onChange={(e) => setMaterial(e.target.value)}>{job.materiales.map((m) => <option key={m} value={m}>{t(m)}</option>)}</Select>
          </div>
        )}
        <div>
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">{t('Precio cliente / viaje (opc. — auto si vacío)')}</div>
          <Input type="number" className="w-32" placeholder={t('auto')} value={precioCliente} onChange={(e) => setPrecioCliente(e.target.value)} />
        </div>
        <Boton variant="gold" onClick={generar} disabled={ocupado || !(Number(cant) > 0)}>
          {ocupado ? <><Spinner /> {t('Generando…')}</> : <><Wand2 size={16} /> {t('Generar órdenes')}</>}
        </Boton>
        {cant > 0 && <span className="text-xs text-slate-500 dark:text-slate-400">→ {viajes} {t('viaje(s) de máx')} {MAX_TON_POR_VIAJE} ton</span>}
      </div>
      {res && <Aviso tipo="ok" className="mt-2">{t('Se generaron')} <b>{res.n} {t('órdenes')}</b> ({res.total} ton){res.tarifa === 'auto' ? ` ${t('con precios del motor de tarifas')}` : res.tarifa === 'manual' ? ` ${t('con precio manual')}` : ` ${t('(sin tarifa configurada aún)')}`} {t('— visibles en')} {t('Órdenes / Cola')}.</Aviso>}
    </Card>
  )
}
