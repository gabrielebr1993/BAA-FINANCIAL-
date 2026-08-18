import { useState } from 'react'
import { Plus, Trash2, Calculator, Check } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, guardar, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { TIPO_BASE, TIPO_BASE_LABEL, UNIDAD_CORTA, calcularTarifa } from '../domain/tarifas'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, EstadoVacio, Aviso } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const vacio = { nombre: '', tipo: TIPO_BASE.POR_TONELADA, valorCliente: '', valorTransportista: '', materiales: [], equipos: [], clienteId: '', recargoUrgencia: '', prioridad: '0' }
// Cantidad de ejemplo para la vista previa según el tipo.
const CANT_EJEMPLO = { por_tonelada: { ton: 25 }, por_yarda: { yardas: 10 }, por_pie: { pies: 100 }, por_milla: { millas: 50 }, por_viaje: {} }
const CANT_TXT = { por_tonelada: '25 ton', por_yarda: '10 yd³', por_pie: '100 ft', por_milla: '50 mi', por_viaje: '1 viaje' }

export default function Tarifas() {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { datos: reglas, cargando } = useColeccion('tariffs')
  const { datos: materiales } = useColeccion('materials')
  const { datos: equipos } = useColeccion('equipment')
  const { datos: clientes } = useColeccion('clients')
  const [f, setF] = useState(vacio)
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  // Multi-selección: agrega/quita de la lista (materiales o equipos).
  const toggle = (k, val) => setF((s) => ({ ...s, [k]: s[k].includes(val) ? s[k].filter((x) => x !== val) : [...s[k], val] }))

  const agregar = async () => {
    if (!f.nombre.trim() || !(Number(f.valorCliente) > 0)) { setMsg({ tipo: 'warn', txt: t('Pon nombre y un precio al cliente válido.') }); return }
    if (f.valorTransportista && Number(f.valorTransportista) > Number(f.valorCliente)) { setMsg({ tipo: 'warn', txt: t('El pago al transportista no puede ser mayor que el cobro al cliente (quedarías en pérdida).') }); return }
    await crear('tariffs', tenantId, {
      nombre: f.nombre.trim(), tipo: f.tipo,
      valorCliente: Number(f.valorCliente),
      valorTransportista: f.valorTransportista ? Number(f.valorTransportista) : null,
      condiciones: { materiales: f.materiales, equipos: f.equipos, clienteId: f.clienteId || null },
      recargoUrgencia: f.recargoUrgencia ? Number(f.recargoUrgencia) : null,
      prioridad: Number(f.prioridad) || 0, activo: true,
    })
    setF(vacio); setMsg({ tipo: 'ok', txt: t('Regla de tarifa creada.') })
  }

  const uni = UNIDAD_CORTA[f.tipo] || ''
  const cobroLabel = f.tipo === TIPO_BASE.POR_VIAJE ? t('COBRO al cliente ($ por viaje)') : `${t('COBRO al cliente')} ($/${uni})`
  const pagoLabel = f.tipo === TIPO_BASE.POR_VIAJE ? t('PAGO al transportista ($ por viaje)') : `${t('PAGO al transportista')} ($/${uni})`

  // Vista previa EN VIVO con lo que estás escribiendo.
  const reglaForm = {
    tipo: f.tipo, valorCliente: Number(f.valorCliente) || 0,
    valorTransportista: f.valorTransportista ? Number(f.valorTransportista) : null,
    condiciones: {}, recargoUrgencia: f.recargoUrgencia ? Number(f.recargoUrgencia) : null, activo: true,
  }
  const preview = Number(f.valorCliente) > 0 ? calcularTarifa([reglaForm], { ...CANT_EJEMPLO[f.tipo] }) : null

  if (cargando) return <Cargando />
  const nombreCliente = (id) => clientes.find((c) => c.id === id)?.nombre || t('Todos')
  const matsActivos = materiales.filter((m) => m.activo !== false)
  const eqActivos = equipos.filter((e) => e.activo !== false)

  return (
    <div className="mx-auto w-full max-w-6xl">
      <PageTitle>{t('Motor de tarifas')}</PageTitle>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-1 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nueva regla')}</h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('Defines qué COBRAS al cliente y qué PAGAS al transportista. La diferencia es tu UTILIDAD. El pago al chofer lo fija el transportista en el perfil del chofer.')}</p>

        {/* Nombre + tipo de unidad + prioridad */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Nombre')}</div><Input placeholder={t('Ej. Grava estándar')} value={f.nombre} onChange={set('nombre')} /></div>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Cobro por')}</div><Select value={f.tipo} onChange={set('tipo')}>{Object.values(TIPO_BASE).map((tb) => <option key={tb} value={tb}>{t(TIPO_BASE_LABEL[tb])}</option>)}</Select></div>
          <div><div className="mb-1 text-[11px] font-bold uppercase text-emerald-600 dark:text-emerald-400">{cobroLabel}</div><Input type="number" inputMode="decimal" placeholder={t('Ej. 18')} value={f.valorCliente} onChange={set('valorCliente')} /></div>
          <div><div className="mb-1 text-[11px] font-bold uppercase text-amber-600 dark:text-amber-400">{pagoLabel}</div><Input type="number" inputMode="decimal" placeholder={t('Ej. 13')} value={f.valorTransportista} onChange={set('valorTransportista')} /></div>
        </div>

        {/* Multi-selección de materiales */}
        <div className="mt-4">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] uppercase text-slate-400">{t('Materiales que cubre')} {f.materiales.length > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-600 dark:text-emerald-400">{f.materiales.length}</span>}<span className="normal-case text-slate-400">· {t('vacío = todos')}</span></div>
          <div className="flex flex-wrap gap-1.5">
            {matsActivos.length === 0 && <span className="text-xs text-slate-400">{t('No hay materiales. Créalos en Materiales.')}</span>}
            {matsActivos.map((m) => {
              const on = f.materiales.includes(m.nombre)
              return <Chip key={m.id} on={on} onClick={() => toggle('materiales', m.nombre)}>{m.nombre}</Chip>
            })}
          </div>
        </div>

        {/* Multi-selección de equipos */}
        <div className="mt-3">
          <div className="mb-1.5 flex items-center gap-2 text-[11px] uppercase text-slate-400">{t('Equipos que cubre')} {f.equipos.length > 0 && <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 font-bold text-emerald-600 dark:text-emerald-400">{f.equipos.length}</span>}<span className="normal-case text-slate-400">· {t('vacío = todos')}</span></div>
          <div className="flex flex-wrap gap-1.5">
            {eqActivos.length === 0 && <span className="text-xs text-slate-400">{t('No hay equipos. Créalos en Equipos.')}</span>}
            {eqActivos.map((e) => {
              const on = f.equipos.includes(e.nombre)
              return <Chip key={e.id} on={on} onClick={() => toggle('equipos', e.nombre)}>{e.nombre}</Chip>
            })}
          </div>
        </div>

        {/* Cliente + recargo urgencia + prioridad */}
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Cliente (opcional)')}</div><Select value={f.clienteId} onChange={set('clienteId')}><option value="">{t('Cualquier cliente')}</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select></div>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Recargo urgencia (ej. 0.15)')}</div><Input type="number" step="0.01" placeholder="0" value={f.recargoUrgencia} onChange={set('recargoUrgencia')} /></div>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Prioridad')}</div><Input type="number" placeholder="0" value={f.prioridad} onChange={set('prioridad')} /></div>
        </div>

        {/* Vista previa en vivo */}
        {preview ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/50">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-brand-navy dark:text-slate-100"><Calculator size={14} className="text-amber-500" /> {t('Ejemplo')}: {CANT_TXT[f.tipo]}</div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>{t('Cobras')} <b className="text-emerald-600 dark:text-emerald-400">{money(preview.precioCliente)}</b></span>
              <span>{t('Pagas al transporte')} <b className="text-amber-600 dark:text-amber-400">{money(preview.precioTransportista)}</b></span>
              <span>{t('Tu utilidad')} <b className="text-brand-navy dark:text-slate-100">{money(preview.utilidad)}</b></span>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">{t('Escribe el COBRO al cliente para ver el ejemplo.')}</div>
        )}

        <div className="mt-3"><Boton variant="gold" onClick={agregar}><Plus size={16} /> {t('Crear regla')}</Boton></div>
      </Card>

      {reglas.length === 0 ? <EstadoVacio titulo={t('Sin reglas de tarifa')} texto={t('Crea la primera arriba. Al generar órdenes, el precio se calculará solo.')} mostrarBoton={false} /> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {reglas.slice().sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0)).map((r) => {
            const mats = (r.condiciones?.materiales && r.condiciones.materiales.length ? r.condiciones.materiales : (r.condiciones?.material ? [r.condiciones.material] : []))
            const eqs = (r.condiciones?.equipos && r.condiciones.equipos.length ? r.condiciones.equipos : (r.condiciones?.tipoEquipo ? [r.condiciones.tipoEquipo] : []))
            const vCli = r.valorCliente != null ? r.valorCliente : r.valor
            const uc = UNIDAD_CORTA[r.tipo] || ''
            return (
              <Card key={r.id} className="p-3">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-brand-navy dark:text-slate-100">{r.nombre}</span>
                  <button onClick={() => guardar('tariffs', r.id, { activo: r.activo === false })}><Badge color={r.activo === false ? 'slate' : 'green'}>{r.activo === false ? t('Inactiva') : t('Activa')}</Badge></button>
                  <button onClick={() => window.confirm(`${t('¿Eliminar')} "${r.nombre}"?`) && eliminar('tariffs', r.id)} className="ml-auto text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
                  <span className="text-emerald-600 dark:text-emerald-400">{money(vCli)}<span className="text-[11px] text-slate-400">/{uc} {t('cliente')}</span></span>
                  {r.valorTransportista != null && <span className="text-amber-600 dark:text-amber-400">→ {money(r.valorTransportista)}<span className="text-[11px] text-slate-400">/{uc} {t('transp.')}</span></span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {mats.map((m) => <Badge key={m} color="navy">{t(m)}</Badge>)}
                  {eqs.map((e) => <Badge key={e} color="slate">{e}</Badge>)}
                  {r.condiciones?.clienteId && <Badge color="gold">{nombreCliente(r.condiciones.clienteId)}</Badge>}
                  {mats.length === 0 && eqs.length === 0 && !r.condiciones?.clienteId && <span className="text-xs text-slate-400">{t('General (aplica a todo)')}</span>}
                </div>
                <div className="mt-1 text-[11px] text-slate-400">{t(TIPO_BASE_LABEL[r.tipo])} · {t('prioridad')} {r.prioridad || 0}</div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Chip de selección múltiple (encendido = incluido).
function Chip({ on, onClick, children }) {
  return (
    <button type="button" onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on
        ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
        : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
      {on && <Check size={12} strokeWidth={3} />} {children}
    </button>
  )
}
