// ============================================================================
// WAREHOUSE / STAFFING · MIS tarifas de pago (independientes de las de Gofo).
//
// · Tarifa regular y OT por posición, con fecha de vigencia e HISTORIAL.
//   Cambiar una tarifa no toca períodos ya importados/aprobados/pagados.
// · Regla de OT propia: respetar el reparto de Gofo o umbral semanal por
//   persona (una sola vez aunque tenga varias posiciones).
// · Mapeo configurable de posiciones (chino → etiqueta) por si Gofo cambia el
//   formato o agrega posiciones. Las tarifas de Gofo del archivo describen el
//   ejemplo; nunca se copian solas a mi nómina.
// ============================================================================
import { useEffect, useState } from 'react'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner } from '../../components/ui'
import { COL, cargar, auditarStaff, refDoc, setDoc } from './datosStaff'
import { POSICIONES_BASE } from './parserGofo'

const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toFixed(2)}`)

export default function WhTarifas({ user }) {
  const [tarifas, setTarifas] = useState(null)
  const [config, setConfig] = useState(null)
  const [nueva, setNueva] = useState({ posicion: '', reg: '', ot: '', desde: '' })
  const [guardando, setGuardando] = useState('')
  const [nuevoMapeo, setNuevoMapeo] = useState({ de: '', a: '' })
  const recargar = async () => {
    const [t, c] = await Promise.all([cargar(COL.tarifas), cargar(COL.config)])
    setTarifas(t)
    setConfig({
      posiciones: c.find((x) => x.id === 'posiciones')?.mapa || { ...POSICIONES_BASE },
      reglas: { reglaOT: 'gofo', umbralSemanal: 40, ...(c.find((x) => x.id === 'reglas') || {}) },
    })
  }
  useEffect(() => { recargar() }, [])
  if (!tarifas || !config) return <div className="py-10 text-center text-sm text-slate-400"><Spinner className="mx-auto mb-2" /> Cargando tarifas…</div>

  const guardarTarifa = async () => {
    const pos = nueva.posicion.trim()
    if (!pos || !nueva.reg || !nueva.ot) return
    setGuardando('tarifa')
    try {
      const existente = tarifas.find((t) => t.id === pos)
      const historial = existente
        ? [...(existente.historial || []), { reg: existente.reg, ot: existente.ot, desde: existente.vigenteDesde || '0000-00-00', hasta: nueva.desde || new Date().toISOString().slice(0, 10), por: existente.actualizadoPor || '' }]
        : []
      await setDoc(refDoc(COL.tarifas, pos), {
        posicion: pos, reg: Number(nueva.reg), ot: Number(nueva.ot),
        vigenteDesde: nueva.desde || new Date().toISOString().slice(0, 10),
        historial, actualizadoPor: user.email, actualizadoEn: new Date().toISOString(),
      })
      await auditarStaff(existente ? 'tarifa_actualizada' : 'tarifa_creada', `${pos}: $${nueva.reg}/h reg · $${nueva.ot}/h OT desde ${nueva.desde || 'hoy'}`)
      setNueva({ posicion: '', reg: '', ot: '', desde: '' })
      recargar()
    } finally { setGuardando('') }
  }

  const guardarReglas = async (reglas) => {
    setGuardando('reglas')
    try {
      await setDoc(refDoc(COL.config, 'reglas'), reglas, { merge: true })
      await auditarStaff('reglas_ot', `regla ${reglas.reglaOT}${reglas.reglaOT === 'semanal' ? ` (umbral ${reglas.umbralSemanal} h)` : ''}`)
      recargar()
    } finally { setGuardando('') }
  }

  const guardarMapeo = async () => {
    if (!nuevoMapeo.de.trim() || !nuevoMapeo.a.trim()) return
    setGuardando('mapeo')
    try {
      const mapa = { ...config.posiciones, [nuevoMapeo.de.trim()]: nuevoMapeo.a.trim() }
      await setDoc(refDoc(COL.config, 'posiciones'), { mapa }, { merge: true })
      await auditarStaff('mapeo_posicion', `${nuevoMapeo.de} → ${nuevoMapeo.a}`)
      setNuevoMapeo({ de: '', a: '' })
      recargar()
    } finally { setGuardando('') }
  }

  return (
    <div>
      <PageTitle>Mis tarifas de pago</PageTitle>
      <Aviso tipo="info" className="mb-4">
        Lo que Gofo te reconoce (tarifas de ingreso) y lo que tú pagas al trabajador son <b>independientes</b>.
        Aquí configuras lo tuyo. La excepción individual de un trabajador manda sobre la tarifa de su posición
        (se configura dentro de su perfil). Cambiar una tarifa no modifica períodos ya importados.
      </Aviso>

      <Card className="mb-4 p-5">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Tarifas por posición</div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-400 dark:border-slate-700">
              <th className="py-1.5 pr-2">Posición</th><th className="pr-2 text-right">Regular/h</th><th className="pr-2 text-right">OT/h</th><th className="pr-2">Vigente desde</th><th className="pr-2">Historial</th>
            </tr></thead>
            <tbody>
              {tarifas.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 text-xs dark:border-slate-800">
                  <td className="py-1.5 pr-2 font-semibold text-brand-navy dark:text-slate-100">{t.posicion}</td>
                  <td className="pr-2 text-right">{dinero(t.reg)}</td>
                  <td className="pr-2 text-right">{dinero(t.ot)}</td>
                  <td className="pr-2">{t.vigenteDesde}</td>
                  <td className="pr-2 text-slate-400">{(t.historial || []).map((h, i) => <div key={i}>{dinero(h.reg)}/{dinero(h.ot)} ({h.desde} → {h.hasta})</div>)}</td>
                </tr>
              ))}
              {tarifas.length === 0 && <tr><td colSpan={5} className="py-3 text-center text-xs text-slate-400">Sin tarifas: al importar, el sistema te preguntará cuánto quieres pagar por cada posición.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input placeholder="Posición (p. ej. Sorter)" className="w-44" value={nueva.posicion} onChange={(e) => setNueva({ ...nueva, posicion: e.target.value })} />
          <Input type="number" step="0.25" placeholder="$ regular/h" className="w-28" value={nueva.reg} onChange={(e) => setNueva({ ...nueva, reg: e.target.value })} />
          <Input type="number" step="0.25" placeholder="$ OT/h" className="w-28" value={nueva.ot} onChange={(e) => setNueva({ ...nueva, ot: e.target.value })} />
          <Input type="date" className="w-40" value={nueva.desde} onChange={(e) => setNueva({ ...nueva, desde: e.target.value })} />
          <Boton variant="gold" disabled={guardando === 'tarifa'} onClick={guardarTarifa}>{guardando === 'tarifa' ? <Spinner /> : 'Guardar tarifa'}</Boton>
        </div>
      </Card>

      <Card className="mb-4 p-5">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Mi regla de horas regulares y OT</div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Select value={config.reglas.reglaOT} onChange={(e) => guardarReglas({ ...config.reglas, reglaOT: e.target.value })} className="w-72">
            <option value="gofo">Respetar el reparto regular/OT del reporte de Gofo</option>
            <option value="semanal">Umbral semanal por persona (todas sus posiciones juntas)</option>
          </Select>
          {config.reglas.reglaOT === 'semanal' && (
            <>
              <span className="text-xs text-slate-500">OT a partir de</span>
              <Input type="number" className="w-20" value={config.reglas.umbralSemanal} onChange={(e) => guardarReglas({ ...config.reglas, umbralSemanal: Number(e.target.value) || 40 })} />
              <span className="text-xs text-slate-500">horas/semana (el umbral se aplica UNA sola vez por persona)</span>
            </>
          )}
          {guardando === 'reglas' && <Spinner />}
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-2 text-sm font-bold text-brand-navy dark:text-slate-100">Mapeo de posiciones del archivo de Gofo</div>
        <div className="mb-2 flex flex-wrap gap-2">
          {Object.entries(config.posiciones).map(([de, a]) => <Badge key={de} color="slate">{de} → {a}</Badge>)}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Texto en el archivo (p. ej. 分拣工)" className="w-56" value={nuevoMapeo.de} onChange={(e) => setNuevoMapeo({ ...nuevoMapeo, de: e.target.value })} />
          <span className="text-slate-400">→</span>
          <Input placeholder="Posición (p. ej. Sorter)" className="w-44" value={nuevoMapeo.a} onChange={(e) => setNuevoMapeo({ ...nuevoMapeo, a: e.target.value })} />
          <Boton variant="ghost" disabled={guardando === 'mapeo'} onClick={guardarMapeo}>{guardando === 'mapeo' ? <Spinner /> : 'Agregar mapeo'}</Boton>
        </div>
        <div className="mt-2 text-[11px] text-slate-400">Si Gofo agrega una posición nueva, agrégala aquí y vuelve a analizar el archivo.</div>
      </Card>
    </div>
  )
}
