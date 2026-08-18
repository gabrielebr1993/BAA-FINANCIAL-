// Motor de tarifas POR CLIENTE. Las reglas se guardan en el propio documento del
// cliente (campo `tarifas`), no en una colección global. El admin agrega materiales,
// tipos de equipo que requiere el cliente y define qué COBRA y qué PAGA por unidad.
import { useState } from 'react'
import { Plus, Trash2, Calculator, Check, DollarSign, Layers, Truck, ArrowRight } from 'lucide-react'
import { guardar } from '../data/repo'
import { TIPO_BASE, TIPO_BASE_LABEL, UNIDAD_CORTA, calcularTarifa, matsDe, eqsDe } from '../domain/tarifas'
import { Card, Boton, Input, Select, Badge, Aviso } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const nuevoVacio = { nombre: '', tipo: TIPO_BASE.POR_TONELADA, valorCliente: '', valorTransportista: '', materiales: [], equipos: [], recargoUrgencia: '', prioridad: '0' }
const CANT_EJEMPLO = { por_tonelada: { ton: 25 }, por_yarda: { yardas: 10 }, por_pie: { pies: 100 }, por_milla: { millas: 50 }, por_viaje: {} }
const CANT_TXT = { por_tonelada: '25 ton', por_yarda: '10 yd³', por_pie: '100 ft', por_milla: '50 mi', por_viaje: '1 viaje' }
const idRegla = () => `tf_${Math.random().toString(36).slice(2, 9)}`

export default function TarifasCliente({ cliente, materiales = [], equipos = [] }) {
  const { t } = useLang()
  const [f, setF] = useState(nuevoVacio)
  const [abierto, setAbierto] = useState(false)
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  const toggle = (k, val) => setF((s) => ({ ...s, [k]: s[k].includes(val) ? s[k].filter((x) => x !== val) : [...s[k], val] }))

  const reglas = cliente?.tarifas || []
  const matsActivos = materiales.filter((m) => m.activo !== false)
  const eqActivos = equipos.filter((e) => e.activo !== false)
  const uni = UNIDAD_CORTA[f.tipo] || ''
  const esViaje = f.tipo === TIPO_BASE.POR_VIAJE

  const guardarReglas = (lista) => guardar('clients', cliente.id, { tarifas: lista })

  const agregar = async () => {
    if (!(Number(f.valorCliente) > 0)) { setMsg({ tipo: 'warn', txt: t('Pon el cobro al cliente.') }); return }
    if (f.valorTransportista && Number(f.valorTransportista) > Number(f.valorCliente)) { setMsg({ tipo: 'warn', txt: t('El pago al transportista no puede ser mayor que el cobro.') }); return }
    const regla = {
      id: idRegla(), nombre: f.nombre.trim() || (f.materiales[0] || t('Tarifa')),
      tipo: f.tipo, valorCliente: Number(f.valorCliente),
      valorTransportista: f.valorTransportista ? Number(f.valorTransportista) : null,
      materiales: f.materiales, equipos: f.equipos,
      recargoUrgencia: f.recargoUrgencia ? Number(f.recargoUrgencia) : null,
      prioridad: Number(f.prioridad) || 0,
    }
    await guardarReglas([...reglas, regla])
    setF(nuevoVacio); setAbierto(false); setMsg({ tipo: 'ok', txt: t('Tarifa agregada.') })
  }
  const borrar = async (id) => { await guardarReglas(reglas.filter((r) => r.id !== id)) }

  // Vista previa en vivo.
  const reglaForm = { tipo: f.tipo, valorCliente: Number(f.valorCliente) || 0, valorTransportista: f.valorTransportista ? Number(f.valorTransportista) : null, condiciones: {}, recargoUrgencia: f.recargoUrgencia ? Number(f.recargoUrgencia) : null, activo: true }
  const prev = Number(f.valorCliente) > 0 ? calcularTarifa([reglaForm], { ...CANT_EJEMPLO[f.tipo] }) : null

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="m-0 flex items-center gap-1.5 text-sm font-bold text-brand-navy dark:text-slate-100"><Calculator size={15} className="text-amber-500" /> {t('Tarifas de este cliente')} <span className="text-xs font-normal text-slate-400">({reglas.length})</span></h3>
        <Boton variant={abierto ? 'ghost' : 'gold'} onClick={() => { setAbierto((v) => !v); setMsg(null) }} className="ml-auto px-3 py-1.5 text-xs">{abierto ? t('Cerrar') : <><Plus size={14} /> {t('Agregar tarifa')}</>}</Boton>
      </div>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">{t('Cada material/equipo que este cliente requiere, con lo que le COBRAS y lo que PAGAS al transportista. La diferencia es tu utilidad.')}</p>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      {/* Formulario de alta */}
      {abierto && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/40">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Lbl t={t('Nombre (opcional)')}><Input placeholder={t('Ej. Grava 3/4')} value={f.nombre} onChange={set('nombre')} /></Lbl>
            <Lbl t={t('Cómo se cobra')}><Select value={f.tipo} onChange={set('tipo')}>{Object.values(TIPO_BASE).map((tb) => <option key={tb} value={tb}>{t(TIPO_BASE_LABEL[tb])}</option>)}</Select></Lbl>
            <Lbl t={esViaje ? t('Cobro ($/viaje)') : `${t('Cobro')} ($/${uni})`} c="emerald"><Input type="number" inputMode="decimal" placeholder={t('Ej. 18')} value={f.valorCliente} onChange={set('valorCliente')} /></Lbl>
            <Lbl t={esViaje ? t('Pago transp. ($/viaje)') : `${t('Pago transp.')} ($/${uni})`} c="amber"><Input type="number" inputMode="decimal" placeholder={t('Ej. 13')} value={f.valorTransportista} onChange={set('valorTransportista')} /></Lbl>
          </div>

          <ChipGroup titulo={t('Materiales')} icon={Layers} opciones={matsActivos.map((m) => ({ val: m.nombre, label: m.nombre }))} sel={f.materiales} onToggle={(v) => toggle('materiales', v)} vacio={t('No hay materiales.')} />
          <ChipGroup titulo={t('Equipos que requiere')} icon={Truck} opciones={eqActivos.map((e) => ({ val: e.nombre, label: e.nombre }))} sel={f.equipos} onToggle={(v) => toggle('equipos', v)} vacio={t('No hay equipos.')} />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Lbl t={t('Recargo urgencia (ej. 0.15)')}><Input type="number" step="0.01" placeholder="0" value={f.recargoUrgencia} onChange={set('recargoUrgencia')} /></Lbl>
            <Lbl t={t('Prioridad')}><Input type="number" placeholder="0" value={f.prioridad} onChange={set('prioridad')} /></Lbl>
          </div>

          {prev && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-white p-3 text-xs shadow-sm dark:bg-slate-900">
              <span className="inline-flex items-center gap-1 font-semibold text-brand-navy dark:text-slate-100"><Calculator size={13} className="text-amber-500" /> {CANT_TXT[f.tipo]}</span>
              <span>{t('Cobras')} <b className="text-emerald-600 dark:text-emerald-400">{money(prev.precioCliente)}</b></span>
              <span>{t('Pagas')} <b className="text-amber-600 dark:text-amber-400">{money(prev.precioTransportista)}</b></span>
              <span>{t('Utilidad')} <b>{money(prev.utilidad)}</b></span>
            </div>
          )}
          <div className="mt-3 flex justify-end"><Boton variant="gold" onClick={agregar}><Plus size={15} /> {t('Guardar tarifa')}</Boton></div>
        </div>
      )}

      {/* Lista de tarifas del cliente */}
      {reglas.length === 0 ? (
        <p className="py-4 text-center text-sm text-slate-400">{t('Este cliente aún no tiene tarifas. Agrega la primera arriba.')}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {reglas.slice().sort((a, b) => (b.prioridad || 0) - (a.prioridad || 0)).map((r) => {
            const mats = matsDe(r); const eqs = eqsDe(r)
            const uc = UNIDAD_CORTA[r.tipo] || ''
            const util = r.valorTransportista != null ? Number(r.valorCliente) - Number(r.valorTransportista) : null
            return (
              <div key={r.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
                <div className="flex items-start gap-2">
                  <span className="min-w-0 flex-1 text-sm font-semibold text-brand-navy dark:text-slate-100">{r.nombre}</span>
                  <button onClick={() => window.confirm(`${t('¿Eliminar tarifa')} "${r.nombre}"?`) && borrar(r.id)} className="text-slate-300 hover:text-rose-500"><Trash2 size={13} /></button>
                </div>
                <div className="mt-1 flex items-center gap-1.5 text-sm">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{money(r.valorCliente)}</span>
                  {r.valorTransportista != null && <><ArrowRight size={12} className="text-slate-300" /><span className="font-bold text-amber-600 dark:text-amber-400">{money(r.valorTransportista)}</span></>}
                  <span className="text-[11px] text-slate-400">/{uc}</span>
                  {util != null && <span className="ml-auto rounded bg-brand-navy/5 px-1.5 py-0.5 text-[11px] font-bold text-brand-navy dark:bg-slate-700 dark:text-slate-200">+{money(util)}</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {mats.map((m) => <Badge key={`m${m}`} color="navy">{t(m)}</Badge>)}
                  {eqs.map((e) => <Badge key={`e${e}`} color="slate">{e}</Badge>)}
                  {!mats.length && !eqs.length && <span className="text-[11px] text-slate-400">{t('Aplica a todo del cliente')}</span>}
                </div>
                <div className="mt-1.5 text-[11px] text-slate-400">{t(TIPO_BASE_LABEL[r.tipo])}</div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function Lbl({ t: label, c, children }) {
  const col = c === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : c === 'amber' ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
  return <label className="block"><span className={`mb-1 block text-[11px] font-semibold uppercase tracking-wide ${col}`}>{label}</span>{children}</label>
}

function ChipGroup({ titulo, icon: Icon, opciones, sel, onToggle, vacio }) {
  return (
    <div className="mt-3">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Icon size={12} /> {titulo} {sel.length > 0 && <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 font-bold text-emerald-600 dark:text-emerald-400">{sel.length}</span>}</div>
      <div className="flex flex-wrap gap-1.5">
        {opciones.length === 0 ? <span className="text-xs text-slate-400">{vacio}</span> : opciones.map((o) => {
          const on = sel.includes(o.val)
          return <button key={o.val} type="button" onClick={() => onToggle(o.val)} className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-slate-600 hover:border-emerald-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>{on && <Check size={12} strokeWidth={3} />} {o.label}</button>
        })}
      </div>
    </div>
  )
}
