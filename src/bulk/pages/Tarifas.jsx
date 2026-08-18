import { useState } from 'react'
import { Plus, Trash2, Calculator, Check, Tag, DollarSign, Layers, Truck, Building2, MapPin, ArrowRight, Search } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, guardar, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { TIPO_BASE, TIPO_BASE_LABEL, UNIDAD_CORTA, calcularTarifa, matsDe, eqsDe, clientesDe, plantasDe } from '../domain/tarifas'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, EstadoVacio, Aviso } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const vacio = { nombre: '', tipo: TIPO_BASE.POR_TONELADA, valorCliente: '', valorTransportista: '', materiales: [], equipos: [], clientes: [], plantas: [], recargoUrgencia: '', prioridad: '0' }
const CANT_EJEMPLO = { por_tonelada: { ton: 25 }, por_yarda: { yardas: 10 }, por_pie: { pies: 100 }, por_milla: { millas: 50 }, por_viaje: {} }
const CANT_TXT = { por_tonelada: '25 ton', por_yarda: '10 yd³', por_pie: '100 ft', por_milla: '50 mi', por_viaje: '1 viaje' }

export default function Tarifas() {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { datos: reglas, cargando } = useColeccion('tariffs')
  const { datos: materiales } = useColeccion('materials')
  const { datos: equipos } = useColeccion('equipment')
  const { datos: clientes } = useColeccion('clients')
  const { datos: plantas } = useColeccion('plants')
  const [f, setF] = useState(vacio)
  const [msg, setMsg] = useState(null)
  const [buscar, setBuscar] = useState('')
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const toggle = (k, val) => setF((s) => ({ ...s, [k]: s[k].includes(val) ? s[k].filter((x) => x !== val) : [...s[k], val] }))

  const agregar = async () => {
    if (!f.nombre.trim() || !(Number(f.valorCliente) > 0)) { setMsg({ tipo: 'warn', txt: t('Pon un nombre y el cobro al cliente.') }); return }
    if (f.valorTransportista && Number(f.valorTransportista) > Number(f.valorCliente)) { setMsg({ tipo: 'warn', txt: t('El pago al transportista no puede ser mayor que el cobro al cliente.') }); return }
    await crear('tariffs', tenantId, {
      nombre: f.nombre.trim(), tipo: f.tipo,
      valorCliente: Number(f.valorCliente),
      valorTransportista: f.valorTransportista ? Number(f.valorTransportista) : null,
      condiciones: { materiales: f.materiales, equipos: f.equipos, clientes: f.clientes, plantas: f.plantas },
      recargoUrgencia: f.recargoUrgencia ? Number(f.recargoUrgencia) : null,
      prioridad: Number(f.prioridad) || 0, activo: true,
    })
    setF(vacio); setMsg({ tipo: 'ok', txt: t('Regla de tarifa creada.') })
  }

  const uni = UNIDAD_CORTA[f.tipo] || ''
  const esViaje = f.tipo === TIPO_BASE.POR_VIAJE
  const cobroLabel = esViaje ? t('Cobro al cliente ($/viaje)') : `${t('Cobro al cliente')} ($/${uni})`
  const pagoLabel = esViaje ? t('Pago al transportista ($/viaje)') : `${t('Pago al transportista')} ($/${uni})`
  // Vista previa EN VIVO.
  const reglaForm = {
    tipo: f.tipo, valorCliente: Number(f.valorCliente) || 0,
    valorTransportista: f.valorTransportista ? Number(f.valorTransportista) : null,
    condiciones: {}, recargoUrgencia: f.recargoUrgencia ? Number(f.recargoUrgencia) : null, activo: true,
  }
  const preview = Number(f.valorCliente) > 0 ? calcularTarifa([reglaForm], { ...CANT_EJEMPLO[f.tipo] }) : null
  const margen = preview && preview.precioCliente > 0 ? Math.round((preview.utilidad / preview.precioCliente) * 100) : 0

  if (cargando) return <Cargando />
  const matsActivos = materiales.filter((m) => m.activo !== false)
  const eqActivos = equipos.filter((e) => e.activo !== false)
  const nombreCliente = (id) => clientes.find((c) => c.id === id)?.nombre || t('Cliente')
  const nombrePlanta = (id) => plantas.find((p) => p.id === id)?.nombre || t('Planta')

  const q = buscar.trim().toLowerCase()
  const reglasFiltradas = reglas
    .filter((r) => !q || (r.nombre || '').toLowerCase().includes(q))
    .slice().sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0))

  return (
    <div className="w-full">
      <PageTitle>{t('Motor de tarifas')}</PageTitle>
      <p className="-mt-1 mb-4 text-sm text-slate-500 dark:text-slate-400">{t('Define qué COBRAS al cliente y qué PAGAS al transportista. La diferencia es tu utilidad. El pago al chofer lo fija el transportista en el perfil del chofer.')}</p>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)]">
        {/* ── Formulario ─────────────────────────────────────────── */}
        <Card className="p-5 sm:p-6">
          <div className="mb-5 flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400"><Plus size={17} /></span><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Nueva regla de tarifa')}</h3></div>

          {/* Paso 1 · Datos */}
          <Grupo n="1" titulo={t('Datos')} icon={Tag}>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px]">
              <Campo label={t('Nombre de la regla')}><Input placeholder={t('Ej. Grava — obra centro')} value={f.nombre} onChange={set('nombre')} /></Campo>
              <Campo label={t('Prioridad')} hint={t('mayor gana')}><Input type="number" placeholder="0" value={f.prioridad} onChange={set('prioridad')} /></Campo>
            </div>
          </Grupo>

          {/* Paso 2 · Precios — todo en una fila que llena el ancho */}
          <Grupo n="2" titulo={t('Precios')} icon={DollarSign}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Campo label={t('Cómo se cobra')}>
                <Select value={f.tipo} onChange={set('tipo')}>{Object.values(TIPO_BASE).map((tb) => <option key={tb} value={tb}>{t(TIPO_BASE_LABEL[tb])}</option>)}</Select>
              </Campo>
              <Campo label={cobroLabel} acento="emerald">
                <Input type="number" inputMode="decimal" placeholder={t('Ej. 18')} value={f.valorCliente} onChange={set('valorCliente')} />
              </Campo>
              <Campo label={pagoLabel} acento="amber">
                <Input type="number" inputMode="decimal" placeholder={t('Ej. 13')} value={f.valorTransportista} onChange={set('valorTransportista')} />
              </Campo>
              <Campo label={t('Recargo urgencia')} hint="ej. 0.15">
                <Input type="number" step="0.01" placeholder="0" value={f.recargoUrgencia} onChange={set('recargoUrgencia')} />
              </Campo>
            </div>
          </Grupo>

          {/* Paso 3 · Aplica a (multi-selección en TODO) */}
          <Grupo n="3" titulo={t('¿A qué aplica?')} icon={Layers} sub={t('Toca para elegir varios. Vacío = aplica a todos.')}>
            <MultiChips titulo={t('Materiales')} icon={Layers} sel={f.materiales} onToggle={(v) => toggle('materiales', v)}
              opciones={matsActivos.map((m) => ({ val: m.nombre, label: m.nombre }))} vacioTxt={t('No hay materiales (créalos en Materiales).')} />
            <MultiChips titulo={t('Equipos')} icon={Truck} sel={f.equipos} onToggle={(v) => toggle('equipos', v)}
              opciones={eqActivos.map((e) => ({ val: e.nombre, label: e.nombre }))} vacioTxt={t('No hay equipos (créalos en Equipos).')} />
            <MultiChips titulo={t('Clientes')} icon={Building2} sel={f.clientes} onToggle={(v) => toggle('clientes', v)}
              opciones={clientes.map((c) => ({ val: c.id, label: c.nombre }))} vacioTxt={t('No hay clientes.')} />
            <MultiChips titulo={t('Plantas')} icon={MapPin} sel={f.plantas} onToggle={(v) => toggle('plantas', v)}
              opciones={plantas.map((p) => ({ val: p.id, label: p.nombre }))} vacioTxt={t('No hay plantas.')} />
          </Grupo>

          <div className="mt-5 flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
            <Boton variant="gold" onClick={agregar}><Plus size={16} /> {t('Crear regla')}</Boton>
          </div>
        </Card>

        {/* ── Resumen en vivo (sticky) ───────────────────────────── */}
        <div className="sticky top-4 space-y-4 self-start">
          <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 bg-brand-navy px-4 py-3 text-white dark:bg-slate-800">
              <Calculator size={16} className="text-amber-400" /> <span className="text-sm font-bold">{t('Resumen del cobro')}</span>
              {preview && <span className="ml-auto rounded-full bg-white/15 px-2 py-0.5 text-[11px] font-bold">{CANT_TXT[f.tipo]}</span>}
            </div>
            {preview ? (
              <div className="p-4">
                <Fila color="emerald" label={t('Cobras al cliente')} val={money(preview.precioCliente)} />
                <div className="my-1 flex justify-center text-slate-300 dark:text-slate-600"><ArrowRight size={14} className="rotate-90" /></div>
                <Fila color="amber" label={t('Pagas al transportista')} val={money(preview.precioTransportista)} />
                <div className="my-3 border-t border-dashed border-slate-200 dark:border-slate-700" />
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('Tu utilidad')}</div>
                    <div className="text-3xl font-black text-brand-navy dark:text-slate-100">{money(preview.utilidad)}</div>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-sm font-bold ${margen >= 0 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'}`}>{margen}% {t('margen')}</span>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-sm text-slate-400"><div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-300 dark:bg-slate-800"><DollarSign size={26} /></div> {t('Escribe el cobro al cliente y el pago al transportista para ver tu utilidad aquí.')}</div>
            )}
          </Card>

          {/* Cómo funciona (llena el espacio y guía) */}
          <Card className="p-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">{t('Cómo funciona')}</div>
            <ul className="space-y-2.5 text-[13px] text-slate-600 dark:text-slate-300">
              <Tip color="emerald" n="1">{t('Pones cuánto COBRAS al cliente.')}</Tip>
              <Tip color="amber" n="2">{t('Pones cuánto PAGAS al transportista.')}</Tip>
              <Tip color="navy" n="3">{t('La diferencia es TU utilidad.')}</Tip>
              <Tip color="slate" n="4">{t('El transportista fija el pago al chofer en el perfil del chofer (% o monto fijo).')}</Tip>
            </ul>
          </Card>
        </div>
      </div>

      {/* ── Reglas existentes ──────────────────────────────────── */}
      <div className="mb-2 mt-6 flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Reglas')} <span className="text-sm font-normal text-slate-400">({reglas.length})</span></h3>
        <div className="relative ml-auto"><Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><Input value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder={t('Buscar regla…')} className="w-56 pl-8" /></div>
      </div>
      {reglas.length === 0 ? <EstadoVacio titulo={t('Sin reglas de tarifa')} texto={t('Crea la primera arriba. Al generar órdenes, el precio se calculará solo.')} mostrarBoton={false} /> : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {reglasFiltradas.map((r) => {
            const mats = matsDe(r.condiciones); const eqs = eqsDe(r.condiciones)
            const cls = clientesDe(r.condiciones); const pls = plantasDe(r.condiciones)
            const vCli = r.valorCliente != null ? r.valorCliente : r.valor
            const uc = UNIDAD_CORTA[r.tipo] || ''
            const util = r.valorTransportista != null ? (Number(vCli) - Number(r.valorTransportista)) : null
            const general = !mats.length && !eqs.length && !cls.length && !pls.length
            return (
              <Card key={r.id} className="flex flex-col p-3.5">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 font-semibold text-brand-navy dark:text-slate-100">{r.nombre}</span>
                  <button onClick={() => window.confirm(`${t('¿Eliminar')} "${r.nombre}"?`) && eliminar('tariffs', r.id)} className="flex-shrink-0 text-slate-300 hover:text-rose-500"><Trash2 size={14} /></button>
                </div>
                <button onClick={() => guardar('tariffs', r.id, { activo: r.activo === false })} className="mt-1 self-start"><Badge color={r.activo === false ? 'slate' : 'green'}>{r.activo === false ? t('Inactiva') : t('Activa')}</Badge></button>
                {/* Precios */}
                <div className="mt-2 flex items-center gap-1.5 text-sm">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{money(vCli)}</span>
                  {r.valorTransportista != null && <><ArrowRight size={12} className="text-slate-300" /><span className="font-bold text-amber-600 dark:text-amber-400">{money(r.valorTransportista)}</span></>}
                  <span className="text-[11px] text-slate-400">/{uc}</span>
                  {util != null && <span className="ml-auto rounded bg-brand-navy/5 px-1.5 py-0.5 text-[11px] font-bold text-brand-navy dark:bg-slate-700 dark:text-slate-200">+{money(util)}</span>}
                </div>
                {/* Condiciones */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {general && <span className="text-[11px] text-slate-400">{t('General (aplica a todo)')}</span>}
                  {mats.map((m) => <Badge key={`m${m}`} color="navy">{t(m)}</Badge>)}
                  {eqs.map((e) => <Badge key={`e${e}`} color="slate">{e}</Badge>)}
                  {cls.map((c) => <Badge key={`c${c}`} color="gold">{nombreCliente(c)}</Badge>)}
                  {pls.map((p) => <Badge key={`p${p}`} color="green">{nombrePlanta(p)}</Badge>)}
                </div>
                <div className="mt-2 border-t border-slate-100 pt-1.5 text-[11px] text-slate-400 dark:border-slate-800">{t(TIPO_BASE_LABEL[r.tipo])} · {t('prioridad')} {r.prioridad || 0}</div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Componentes de UI ──────────────────────────────────────────────
function Grupo({ n, titulo, sub, icon: Icon, children }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-black text-slate-500 dark:bg-slate-800 dark:text-slate-300">{n}</span>
        <Icon size={15} className="text-amber-500" />
        <span className="text-sm font-bold text-brand-navy dark:text-slate-100">{titulo}</span>
        {sub && <span className="text-[11px] text-slate-400">· {sub}</span>}
      </div>
      <div className="pl-8">{children}</div>
    </div>
  )
}

function Campo({ label, hint, acento, children }) {
  const c = acento === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : acento === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
  return (
    <label className="block">
      <span className={`mb-1 block text-[11px] font-semibold uppercase tracking-wide ${c}`}>{label}{hint && <span className="ml-1 normal-case text-slate-400">({hint})</span>}</span>
      {children}
    </label>
  )
}

function MultiChips({ titulo, icon: Icon, opciones, sel, onToggle, vacioTxt }) {
  return (
    <div className="mt-3 first:mt-0">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        <Icon size={12} /> {titulo}
        {sel.length > 0 && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-600 dark:text-emerald-400">{sel.length}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {opciones.length === 0 ? <span className="text-xs text-slate-400">{vacioTxt}</span>
          : opciones.map((o) => {
            const on = sel.includes(o.val)
            return (
              <button key={o.val} type="button" onClick={() => onToggle(o.val)}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on
                  ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                  : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                {on && <Check size={12} strokeWidth={3} />} {o.label}
              </button>
            )
          })}
      </div>
    </div>
  )
}

function Tip({ color, n, children }) {
  const c = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', navy: 'bg-brand-navy dark:bg-slate-300', slate: 'bg-slate-400' }[color] || 'bg-slate-400'
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-0.5 grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-[11px] font-black text-white ${c}`}>{n}</span>
      <span>{children}</span>
    </li>
  )
}

function Fila({ color, label, val }) {
  const c = color === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  const dot = color === 'emerald' ? 'bg-emerald-500' : 'bg-amber-500'
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5 dark:border-slate-700/60">
      <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-300"><span className={`h-2 w-2 rounded-full ${dot}`} /> {label}</span>
      <span className={`text-lg font-black ${c}`}>{val}</span>
    </div>
  )
}
