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
import { COL, cargar, auditarStaff, refDoc, setDoc, escribirEnLotes } from './datosStaff'
import { etiquetaPosicion } from './calculosStaff'
import { POSICIONES_BASE } from './parserGofo'

const dinero = (n) => (n === null || n === undefined ? '—' : `$${Number(n).toFixed(2)}`)

export default function WhTarifas({ user }) {
  const [tarifas, setTarifas] = useState(null)
  const [config, setConfig] = useState(null)
  const [grupos, setGrupos] = useState([])
  const [nueva, setNueva] = useState({ posicion: '', reg: '', ot: '', desde: '', otFlat: false })
  const [guardando, setGuardando] = useState('')
  const [nuevoMapeo, setNuevoMapeo] = useState({ de: '', a: '' })
  const [escal, setEscal] = useState({ posicion: '', filas: [{ minDias: '', reg: '', ot: '', otFlat: false }] })
  const [nuevoGrupo, setNuevoGrupo] = useState({ nombre: '', reglaOT: '', umbralSemanal: '', tarifas: '' })
  const recargar = async () => {
    const [t, c, g] = await Promise.all([cargar(COL.tarifas), cargar(COL.config), cargar(COL.grupos)])
    setTarifas(t)
    setGrupos(g)
    setConfig({
      posiciones: c.find((x) => x.id === 'posiciones')?.mapa || { ...POSICIONES_BASE },
      reglas: { reglaOT: 'gofo', umbralSemanal: 40, ...(c.find((x) => x.id === 'reglas') || {}) },
    })
  }
  useEffect(() => { recargar() }, [])
  if (!tarifas || !config) return <div className="py-10 text-center text-sm text-slate-400"><Spinner className="mx-auto mb-2" /> Cargando tarifas…</div>

  const guardarTarifa = async () => {
    const pos = nueva.posicion.trim()
    if (!pos || !nueva.reg || (!nueva.otFlat && !nueva.ot)) return
    const otGuardar = nueva.otFlat ? 0 : Number(nueva.ot)
    setGuardando('tarifa')
    try {
      const existente = tarifas.find((t) => t.id === pos)
      const historial = existente
        ? [...(existente.historial || []), { reg: existente.reg, ot: existente.ot, desde: existente.vigenteDesde || '0000-00-00', hasta: nueva.desde || new Date().toISOString().slice(0, 10), por: existente.actualizadoPor || '' }]
        : []
      await setDoc(refDoc(COL.tarifas, pos), {
        posicion: pos, reg: Number(nueva.reg), ot: otGuardar,
        vigenteDesde: nueva.desde || new Date().toISOString().slice(0, 10),
        historial, actualizadoPor: user.email, actualizadoEn: new Date().toISOString(),
      })
      await auditarStaff(existente ? 'tarifa_actualizada' : 'tarifa_creada', `${pos}: $${nueva.reg}/h reg · ${nueva.otFlat ? 'OT flat (= regular)' : `$${nueva.ot}/h OT`} desde ${nueva.desde || 'hoy'}`)
      setNueva({ posicion: '', reg: '', ot: '', desde: '', otFlat: false })
      recargar()
    } finally { setGuardando('') }
  }

  const guardarEscalones = async () => {
    const pos = escal.posicion.trim()
    if (!pos) return
    // Flat rate (casilla o OT en 0/vacía) = las horas extra se pagan a la regular
    const lista = escal.filas
      .map((f) => ({ minDias: Number(f.minDias) || 0, reg: Number(f.reg), ot: f.otFlat || f.ot === '' || f.ot === null || f.ot === undefined ? 0 : Number(f.ot) }))
      .filter((f) => Number.isFinite(f.reg) && f.reg > 0 && Number.isFinite(f.ot) && f.ot >= 0)
      .sort((a, b) => b.minDias - a.minDias)
    setGuardando('escalones')
    try {
      const existente = tarifas.find((t) => t.id === pos)
      await setDoc(refDoc(COL.tarifas, pos), {
        posicion: pos,
        ...(existente ? {} : { reg: lista.length ? lista[lista.length - 1].reg : null, ot: lista.length ? lista[lista.length - 1].ot : null, vigenteDesde: new Date().toISOString().slice(0, 10), historial: [] }),
        escalones: lista,
        actualizadoPor: user.email, actualizadoEn: new Date().toISOString(),
      }, { merge: true })
      await auditarStaff('tarifa_escalones', `${pos}: ${lista.length ? lista.map((e) => `≥${e.minDias} días $${e.reg}/${e.ot > 0 ? `$${e.ot}` : 'flat'}`).join(' · ') : 'regla por días eliminada'}`)
      setEscal({ posicion: '', filas: [{ minDias: '', reg: '', ot: '', otFlat: false }] })
      recargar()
    } finally { setGuardando('') }
  }

  const eliminarTarifa = async (t) => {
    if (!window.confirm(`¿Eliminar la tarifa de "${t.posicion}" (incluye su historial y su regla por días)?\n\nLas semanas ya importadas NO cambian. Si vuelves a importar y la posición no tiene tarifa, el sistema te la preguntará de nuevo.`)) return
    setGuardando('tarifa')
    try {
      await escribirEnLotes([{ ref: refDoc(COL.tarifas, t.id), borrar: true }])
      await auditarStaff('tarifa_eliminada', `${t.posicion} (reg ${t.reg ?? '—'}, OT ${t.ot ?? '—'})`)
      recargar()
    } finally { setGuardando('') }
  }

  const quitarEscalones = async (t) => {
    if (!window.confirm(`¿Quitar la regla por días de "${t.posicion}"? Volverá a usar su tarifa fija.`)) return
    setGuardando('escalones')
    try {
      await setDoc(refDoc(COL.tarifas, t.id), { escalones: [], actualizadoPor: user.email, actualizadoEn: new Date().toISOString() }, { merge: true })
      await auditarStaff('tarifa_escalones', `${t.posicion}: regla por días eliminada`)
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

  const guardarGrupo = async () => {
    const nombre = nuevoGrupo.nombre.trim()
    if (!nombre) return
    setGuardando('grupo')
    try {
      // tarifas en texto "Sorter 14/21, Forklift 16/24" → objeto {pos: {reg, ot}}
      const tarifasG = {}
      for (const parte of nuevoGrupo.tarifas.split(',')) {
        const m = parte.trim().match(/^(.+?)\s+(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/)
        if (m) tarifasG[m[1].trim()] = { reg: Number(m[2]), ot: Number(m[3]) }
      }
      const id = 'g_' + nombre.toLowerCase().replace(/[^a-z0-9]+/g, '_')
      await setDoc(refDoc(COL.grupos, id), {
        nombre,
        reglaOT: nuevoGrupo.reglaOT || null,
        umbralSemanal: nuevoGrupo.reglaOT === 'semanal' ? (Number(nuevoGrupo.umbralSemanal) || 40) : null,
        tarifas: tarifasG,
        creadoPor: user.email, creadoEn: new Date().toISOString(),
      })
      await auditarStaff('grupo_creado', `${nombre} (OT ${nuevoGrupo.reglaOT || 'general'}; ${Object.keys(tarifasG).length} tarifas)`)
      setNuevoGrupo({ nombre: '', reglaOT: '', umbralSemanal: '', tarifas: '' })
      recargar()
    } finally { setGuardando('') }
  }
  const eliminarGrupo = async (g) => {
    if (!window.confirm(`¿Eliminar el grupo "${g.nombre}"? Los trabajadores asignados vuelven a las tarifas de posición.`)) return
    setGuardando('grupo')
    try {
      await escribirEnLotes([{ ref: refDoc(COL.grupos, g.id), borrar: true }])
      await auditarStaff('grupo_eliminado', g.nombre)
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
              <th className="py-1.5 pr-2">Posición</th><th className="pr-2 text-right">Regular/h</th><th className="pr-2 text-right">OT/h</th><th className="pr-2">Vigente desde</th><th className="pr-2">Historial</th><th className="pr-2"></th>
            </tr></thead>
            <tbody>
              {tarifas.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 text-xs dark:border-slate-800">
                  <td className="py-1.5 pr-2 font-semibold text-brand-navy dark:text-slate-100">
                    {etiquetaPosicion(t.posicion, config.posiciones)}
                    {(t.escalones || []).length > 0 && <div className="mt-0.5 text-[10px] font-normal text-amber-600 dark:text-amber-400">por días: {t.escalones.map((e) => `≥${e.minDias}d ${dinero(e.reg)}`).join(' · ')}</div>}
                  </td>
                  <td className="pr-2 text-right">{dinero(t.reg)}</td>
                  <td className="pr-2 text-right">{Number(t.ot) > 0 ? dinero(t.ot) : <span className="text-slate-400">flat</span>}</td>
                  <td className="pr-2">{t.vigenteDesde}</td>
                  <td className="pr-2 text-slate-400">{(t.historial || []).map((h, i) => <div key={i}>{dinero(h.reg)}/{dinero(h.ot)} ({h.desde} → {h.hasta})</div>)}</td>
                  <td className="pr-2 text-right"><button className="text-rose-400 hover:text-rose-600" onClick={() => eliminarTarifa(t)}>eliminar</button></td>
                </tr>
              ))}
              {tarifas.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-xs text-slate-400">Sin tarifas: al importar, el sistema te preguntará cuánto quieres pagar por cada posición.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input placeholder="Posición (p. ej. Sorter)" className="w-44" value={nueva.posicion} onChange={(e) => setNueva({ ...nueva, posicion: e.target.value })} />
          <Input type="number" step="0.25" placeholder="$ regular/h" className="w-28" value={nueva.reg} onChange={(e) => setNueva({ ...nueva, reg: e.target.value })} />
          {!nueva.otFlat && <Input type="number" step="0.25" placeholder="$ OT/h" className="w-28" value={nueva.ot} onChange={(e) => setNueva({ ...nueva, ot: e.target.value })} />}
          <label className="inline-flex items-center gap-1.5 text-xs text-slate-500">
            <input type="checkbox" checked={nueva.otFlat} onChange={(e) => setNueva({ ...nueva, otFlat: e.target.checked, ot: '' })} />
            Flat rate (sin OT: toda hora se paga a la regular)
          </label>
          <Input type="date" className="w-40" value={nueva.desde} onChange={(e) => setNueva({ ...nueva, desde: e.target.value })} />
          <Boton variant="gold" disabled={guardando === 'tarifa'} onClick={guardarTarifa}>{guardando === 'tarifa' ? <Spinner /> : 'Guardar tarifa'}</Boton>
        </div>
      </Card>

      <Card className="mb-4 p-5">
        <div className="mb-1 text-sm font-bold text-brand-navy dark:text-slate-100">Tarifa por días trabajados (escalones)</div>
        <p className="mb-3 text-xs text-slate-500">
          Para posiciones donde pagas según los días que la persona trabajó en la semana.
          Ejemplo Sorter: trabaja <b>6 días → $15/h</b>, <b>5 días → $14/h</b>, <b>4 o menos → $13/h</b>.
          Se escribe como: desde 6 días $15, desde 5 días $14, desde 0 días $13.
          Se cuentan los días con horas de la persona en toda la semana. La excepción individual
          y la tarifa de grupo siguen mandando sobre esta regla.
          <b> ¿Posición flat rate (sin OT)?</b> Deja la OT en 0 o vacía: las horas extra se pagan
          a la misma tarifa regular del escalón, nunca a $0.
        </p>
        {tarifas.filter((t) => (t.escalones || []).length).map((t) => (
          <div key={t.id} className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs dark:border-slate-700/60">
            <Badge color="navy">{etiquetaPosicion(t.posicion, config.posiciones)}</Badge>
            {t.escalones.map((e, i) => <span key={i} className="text-slate-600 dark:text-slate-300">desde {e.minDias} días: {dinero(e.reg)} / {Number(e.ot) > 0 ? `${dinero(e.ot)} OT` : 'flat (OT = regular)'}</span>)}
            <button className="ml-auto text-xs font-semibold text-brand-navy hover:underline dark:text-slate-200"
              onClick={() => setEscal({ posicion: t.posicion, filas: t.escalones.map((e) => ({ minDias: String(e.minDias), reg: String(e.reg), ot: Number(e.ot) > 0 ? String(e.ot) : '', otFlat: !(Number(e.ot) > 0) })) })}>editar</button>
            <button className="text-rose-400 hover:text-rose-600" onClick={() => quitarEscalones(t)}>quitar</button>
          </div>
        ))}
        <div className="mt-2 space-y-2">
          <Input placeholder="Posición (p. ej. Sorter)" className="w-44" value={escal.posicion} onChange={(e) => setEscal({ ...escal, posicion: e.target.value })} />
          {escal.filas.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>desde</span>
              <Input type="number" min="0" className="w-16" placeholder="días" value={f.minDias} onChange={(e) => setEscal({ ...escal, filas: escal.filas.map((x, j) => j === i ? { ...x, minDias: e.target.value } : x) })} />
              <span>días →</span>
              <Input type="number" step="0.25" className="w-24" placeholder="$ regular/h" value={f.reg} onChange={(e) => setEscal({ ...escal, filas: escal.filas.map((x, j) => j === i ? { ...x, reg: e.target.value } : x) })} />
              {!f.otFlat && <Input type="number" step="0.25" className="w-24" placeholder="$ OT/h" value={f.ot} onChange={(e) => setEscal({ ...escal, filas: escal.filas.map((x, j) => j === i ? { ...x, ot: e.target.value } : x) })} />}
              <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <input type="checkbox" checked={!!f.otFlat} onChange={(e) => setEscal({ ...escal, filas: escal.filas.map((x, j) => j === i ? { ...x, otFlat: e.target.checked, ot: '' } : x) })} />
                flat rate
              </label>
              <button className="text-rose-400 hover:text-rose-600" onClick={() => setEscal({ ...escal, filas: escal.filas.filter((_, j) => j !== i) })}>quitar</button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <Boton variant="ghost" onClick={() => setEscal({ ...escal, filas: [...escal.filas, { minDias: '', reg: '', ot: '', otFlat: false }] })}>+ agregar escalón</Boton>
            <Boton variant="gold" disabled={guardando === 'escalones' || !escal.posicion.trim()} onClick={guardarEscalones}>{guardando === 'escalones' ? <Spinner /> : 'Guardar regla por días'}</Boton>
            <span className="text-[11px] text-slate-400">Guardar sin escalones elimina la regla y vuelve a la tarifa fija.</span>
          </div>
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

      <Card className="mb-4 p-5">
        <div className="mb-1 text-sm font-bold text-brand-navy dark:text-slate-100">Grupos de pago</div>
        <p className="mb-3 text-xs text-slate-500">
          Un grupo agrupa trabajadores con sus propias reglas: tarifas por posición y/o regla de OT propia.
          Prioridad al calcular: <b>excepción individual → grupo del trabajador → regla por días de la posición → tarifa de la posición</b>.
          El grupo de cada persona se asigna dentro de su perfil (pestaña Trabajadores).
        </p>
        {grupos.length > 0 && (
          <div className="mb-3 space-y-2">
            {grupos.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-100 px-3 py-2 text-xs dark:border-slate-700/60">
                <Badge color="navy">{g.nombre}</Badge>
                <span className="text-slate-500">OT: {g.reglaOT === 'semanal' ? `umbral semanal ${g.umbralSemanal || 40} h` : g.reglaOT === 'gofo' ? 'como Gofo' : 'regla general'}</span>
                <span className="text-slate-500">
                  {Object.keys(g.tarifas || {}).length
                    ? Object.entries(g.tarifas).map(([p, t]) => `${p} ${dinero(t.reg)}/${dinero(t.ot)}`).join(' · ')
                    : 'sin tarifas propias (usa las de posición)'}
                </span>
                <button className="ml-auto text-rose-400 hover:text-rose-600" onClick={() => eliminarGrupo(g)}>eliminar</button>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder="Nombre del grupo (p. ej. FLD noche)" value={nuevoGrupo.nombre} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, nombre: e.target.value })} />
          <Select value={nuevoGrupo.reglaOT} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, reglaOT: e.target.value })}>
            <option value="">OT: usar la regla general</option>
            <option value="gofo">OT: como el reporte de Gofo</option>
            <option value="semanal">OT: umbral semanal propio</option>
          </Select>
          {nuevoGrupo.reglaOT === 'semanal' && <Input type="number" placeholder="Umbral (40)" value={nuevoGrupo.umbralSemanal} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, umbralSemanal: e.target.value })} />}
          <Input placeholder="Tarifas: Sorter 14/21, Forklift 16/24" value={nuevoGrupo.tarifas} onChange={(e) => setNuevoGrupo({ ...nuevoGrupo, tarifas: e.target.value })} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <Boton variant="gold" disabled={guardando === 'grupo' || !nuevoGrupo.nombre.trim()} onClick={guardarGrupo}>{guardando === 'grupo' ? <Spinner /> : 'Crear grupo'}</Boton>
          <span className="text-[11px] text-slate-400">Las tarifas del grupo se escriben como "Posición reg/ot" separadas por coma (opcional).</span>
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
