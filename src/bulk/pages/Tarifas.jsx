import { useState } from 'react'
import { Plus, Trash2, Calculator } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, guardar, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { TIPO_BASE, TIPO_BASE_LABEL, calcularTarifa } from '../domain/tarifas'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, EstadoVacio, Aviso } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const vacio = { nombre: '', tipo: TIPO_BASE.POR_TONELADA, valor: '', material: '', tipoEquipo: '', clienteId: '', pctTransportista: '0.72', pctChofer: '0.8', recargoUrgencia: '', prioridad: '0' }

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

  const agregar = async () => {
    if (!f.nombre.trim() || !(Number(f.valor) > 0)) { setMsg({ tipo: 'warn', txt: t('Pon nombre y un valor válido.') }); return }
    await crear('tariffs', tenantId, {
      nombre: f.nombre.trim(), tipo: f.tipo, valor: Number(f.valor),
      condiciones: { material: f.material || null, tipoEquipo: f.tipoEquipo || null, clienteId: f.clienteId || null },
      pctTransportista: Number(f.pctTransportista) || 0.72,
      pctChofer: Number(f.pctChofer) || 0.8,
      recargoUrgencia: f.recargoUrgencia ? Number(f.recargoUrgencia) : null,
      prioridad: Number(f.prioridad) || 0, activo: true,
    })
    setF(vacio); setMsg({ tipo: 'ok', txt: t('Regla de tarifa creada.') })
  }

  // Etiqueta del campo "Valor" según el tipo elegido (deja claro qué precio pones).
  const valorLabel = f.tipo === TIPO_BASE.POR_TONELADA ? t('Precio POR TONELADA ($)')
    : f.tipo === TIPO_BASE.POR_MILLA ? t('Precio POR MILLA ($)')
    : t('Precio FIJO por viaje ($)')
  const tonEj = 25, millasEj = 50
  // Vista previa EN VIVO con lo que estás escribiendo (no solo con reglas guardadas).
  const reglaForm = {
    tipo: f.tipo, valor: Number(f.valor) || 0, condiciones: {},
    pctTransportista: Number(f.pctTransportista) || 0.72,
    pctChofer: Number(f.pctChofer) || 0.8,
    recargoUrgencia: f.recargoUrgencia ? Number(f.recargoUrgencia) : null, activo: true,
  }
  const preview = Number(f.valor) > 0
    ? calcularTarifa([reglaForm], { material: f.material, tipoEquipo: f.tipoEquipo, clienteId: f.clienteId, ton: tonEj, millas: millasEj })
    : null

  if (cargando) return <Cargando />
  const nombreCliente = (id) => clientes.find((c) => c.id === id)?.nombre || t('Todos')

  return (
    <div>
      <PageTitle>{t('Motor de tarifas')}</PageTitle>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-1 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nueva regla')}</h3>
        <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('El PRECIO lo defines con Tipo + Valor: “Por tonelada” = $/ton, “Por viaje” = precio fijo. Los porcentajes de abajo solo REPARTEN ese precio entre transportista y chofer.')}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Nombre')}</div><Input placeholder={t('Ej. Grava estándar')} value={f.nombre} onChange={set('nombre')} /></div>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Tipo de cobro')}</div><Select value={f.tipo} onChange={set('tipo')}>{Object.values(TIPO_BASE).map((tb) => <option key={tb} value={tb}>{t(TIPO_BASE_LABEL[tb])}</option>)}</Select></div>
          <div><div className="mb-1 text-[11px] font-bold uppercase text-amber-600 dark:text-amber-400">{valorLabel}</div><Input type="number" inputMode="decimal" placeholder={t('Ej. 12')} value={f.valor} onChange={set('valor')} /></div>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Prioridad')}</div><Input type="number" placeholder="0" value={f.prioridad} onChange={set('prioridad')} /></div>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <Select value={f.material} onChange={set('material')}><option value="">{t('Cualquier material')}</option>{materiales.filter((m) => m.activo !== false).map((m) => <option key={m.id} value={m.nombre}>{m.nombre}</option>)}</Select>
          <Select value={f.tipoEquipo} onChange={set('tipoEquipo')}><option value="">{t('Cualquier equipo')}</option>{equipos.filter((e) => e.activo !== false).map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}</Select>
          <Select value={f.clienteId} onChange={set('clienteId')}><option value="">{t('Cualquier cliente')}</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('% al transportista (0–1)')}</div><Input type="number" step="0.01" value={f.pctTransportista} onChange={set('pctTransportista')} /></div>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('% del transportista al chofer (0–1)')}</div><Input type="number" step="0.01" value={f.pctChofer} onChange={set('pctChofer')} /></div>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">{t('Recargo urgencia (ej. 0.15)')}</div><Input type="number" step="0.01" value={f.recargoUrgencia} onChange={set('recargoUrgencia')} /></div>
        </div>
        {preview ? (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs dark:bg-slate-800/50">
            <div className="mb-1 flex items-center gap-1.5 font-semibold text-brand-navy dark:text-slate-100"><Calculator size={14} className="text-amber-500" /> {t('Ejemplo')}: {f.tipo === TIPO_BASE.POR_TONELADA ? `${tonEj} ${t('ton')}` : f.tipo === TIPO_BASE.POR_MILLA ? `${millasEj} ${t('millas')}` : t('1 viaje')}</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>{t('Cobras al cliente')} <b className="text-brand-navy dark:text-slate-100">{money(preview.precioCliente)}</b></span>
              <span>· {t('paga al transportista')} <b>{money(preview.precioTransportista)}</b></span>
              <span>· {t('recibe el chofer')} <b>{money(preview.pagoChofer)}</b></span>
              <span>· {t('tu utilidad')} <b className="text-emerald-600 dark:text-emerald-400">{money(preview.precioCliente - preview.precioTransportista)}</b></span>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-xl bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">{t('Escribe un Valor mayor que 0 para ver el ejemplo de cobro.')}</div>
        )}
        <div className="mt-3"><Boton variant="gold" onClick={agregar}><Plus size={16} /> {t('Crear regla')}</Boton></div>
      </Card>

      {reglas.length === 0 ? <EstadoVacio titulo={t('Sin reglas de tarifa')} texto={t('Crea la primera arriba. Al generar órdenes, el precio se calculará solo.')} mostrarBoton={false} /> : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {reglas.slice().sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0)).map((r) => (
            <Card key={r.id} className="p-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-brand-navy dark:text-slate-100">{r.nombre}</span>
                <button onClick={() => guardar('tariffs', r.id, { activo: r.activo === false })}><Badge color={r.activo === false ? 'slate' : 'green'}>{r.activo === false ? t('Inactiva') : t('Activa')}</Badge></button>
                <button onClick={() => window.confirm(`${t('¿Eliminar')} "${r.nombre}"?`) && eliminar('tariffs', r.id)} className="ml-auto text-rose-400 hover:text-rose-600"><Trash2 size={14} /></button>
              </div>
              <div className="mt-1 text-sm">{money(r.valor)} · {t(TIPO_BASE_LABEL[r.tipo])}</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {r.condiciones?.material && <Badge color="navy">{r.condiciones.material}</Badge>}
                {r.condiciones?.tipoEquipo && <Badge color="navy">{r.condiciones.tipoEquipo}</Badge>}
                {r.condiciones?.clienteId && <Badge color="slate">{nombreCliente(r.condiciones.clienteId)}</Badge>}
                {!r.condiciones?.material && !r.condiciones?.tipoEquipo && !r.condiciones?.clienteId && <span className="text-xs text-slate-400">{t('General (aplica a todo)')}</span>}
              </div>
              <div className="mt-1 text-[11px] text-slate-400">{t('Transp.')} {Math.round((r.pctTransportista ?? 0.72) * 100)}% · {t('chofer')} {Math.round((r.pctChofer ?? 0.8) * 100)}% · {t('prioridad')} {r.prioridad || 0}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
