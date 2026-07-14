import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore'
import { Building2, Users, Landmark } from 'lucide-react'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { costoManagers, TODAS } from '../utils/calc'
import { nombreCiudad } from '../constants'
import { money } from '../utils/format'
import { exportarDatosBancarios } from '../utils/exportarBancos'
import { Card, Boton, Aviso, Badge, Input, Select } from './ui'

const vacio = { nombre: '', ciudad: '', sueldoSemanal: '' }

export default function ManagersPanel() {
  const navigate = useNavigate()
  const { managers: managersAll, reloadManagers, activeCompanyId, ciudadesEmpresa, invoicesRango, selectedCity } = useData()
  const { ciudadBloqueada, ciudadUsuario } = useAuth()
  // Gastos fijos visibles según la ciudad seleccionada en la barra global:
  //  - Usuario bloqueado a su ciudad: solo los de SU ciudad.
  //  - Ciudad elegida (≠ Todas): solo los de esa ciudad.
  //  - "Todas": todos.
  const ciudadFiltro = ciudadBloqueada ? ciudadUsuario : (selectedCity && selectedCity !== TODAS ? selectedCity : null)
  const managers = ciudadFiltro ? managersAll.filter((m) => (m.ciudad || '') === ciudadFiltro) : managersAll
  const ciudadesForm = ciudadBloqueada ? (ciudadesEmpresa || []).filter((c) => c.codigo === ciudadUsuario) : (ciudadesEmpresa || []).filter((c) => c.codigo)
  const exportarBancarios = () => exportarDatosBancarios(managers.map((m) => ({ nombre: m.nombre, verificacion: m.verificacion })), `datos-bancarios-gastos-fijos_${new Date().toISOString().slice(0, 10)}`)
  const [form, setForm] = useState(vacio)
  const [editId, setEditId] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const semanas = Math.max(1, invoicesRango.length)
  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const cancelar = () => { setEditId(null); setForm(vacio); setError('') }

  // Nombre legible de una ciudad (por su código): ciudades de la empresa → tabla estándar.
  const nombreDe = (code) => {
    if (!code) return 'Sin ciudad'
    const c = (ciudadesEmpresa || []).find((x) => x.codigo === code)
    return c ? c.nombre : nombreCiudad(code)
  }

  // Grupos por ciudad (códigos presentes en managers + ciudades de la empresa).
  const grupos = useMemo(() => {
    const codes = new Set([...(ciudadesEmpresa || []).map((c) => c.codigo).filter(Boolean), ...managers.map((m) => m.ciudad || '')])
    return [...codes].sort((a, b) => nombreDe(a).localeCompare(nombreDe(b))).map((code) => {
      const items = managers.filter((m) => (m.ciudad || '') === code).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
      const activos = items.filter((m) => m.activo !== false)
      return { code, nombre: nombreDe(code), items, costo: costoManagers(activos, semanas, code || undefined) }
    }).filter((g) => g.items.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [managers, ciudadesEmpresa, semanas])

  const costoTotal = costoManagers(managers, semanas) // todas las ciudades

  // Managers cuya ciudad NO está entre las ciudades de la empresa (vacía o código
  // que no existe): su costo NO aparece al filtrar por ciudad, solo en "Todas".
  const codigosEmpresa = new Set((ciudadesEmpresa || []).map((c) => c.codigo).filter(Boolean))
  const sinCiudad = managers.filter((m) => !codigosEmpresa.has(m.ciudad || ''))
  const ciudadesConCodigo = (ciudadesEmpresa || []).filter((c) => c.codigo)
  const [reasignando, setReasignando] = useState(false)

  // Asigna TODOS los managers sin ciudad válida a una ciudad (útil con 1 sola ciudad).
  const reasignarTodos = async (code) => {
    if (!code) return
    setReasignando(true)
    try {
      for (const m of sinCiudad) await updateDoc(doc(db, 'managers', m.id), { ciudad: code })
      await reloadManagers()
    } finally { setReasignando(false) }
  }

  const guardar = async () => {
    if (!form.nombre.trim()) return setError('El nombre es obligatorio.')
    const ciudadFinal = ciudadBloqueada ? ciudadUsuario : form.ciudad
    if (!ciudadFinal) return setError('Elige la ciudad a la que pertenece el gasto fijo.')
    if (Number(form.sueldoSemanal) < 0) return setError('El monto no puede ser negativo.')
    setGuardando(true); setError('')
    try {
      const payload = { nombre: form.nombre.trim(), ciudad: ciudadFinal, sueldoSemanal: Number(form.sueldoSemanal) || 0 }
      if (editId) await updateDoc(doc(db, 'managers', editId), payload)
      else await addDoc(collection(db, 'managers'), { ...payload, activo: true, companyId: activeCompanyId })
      await reloadManagers()
      cancelar()
    } catch (e) {
      setError('Error al guardar: ' + e.message)
    } finally {
      setGuardando(false)
    }
  }

  const editar = (m) => { setEditId(m.id); setForm({ nombre: m.nombre || '', ciudad: m.ciudad || '', sueldoSemanal: m.sueldoSemanal ?? '' }) }
  const toggle = async (m) => { await updateDoc(doc(db, 'managers', m.id), { activo: !(m.activo !== false) }); await reloadManagers() }

  return (
    <div>
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{editId ? 'Editar gasto fijo' : 'Agregar gasto fijo'}</h3>
        {error && <Aviso tipo="error">{error}</Aviso>}
        {(ciudadesEmpresa || []).length === 0 && (
          <Aviso tipo="warn">Primero agrega ciudades en <b>Configuración → Mis ciudades</b>: cada gasto fijo pertenece a una ciudad.</Aviso>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Nombre</div>
            <Input className="w-52" value={form.nombre} onChange={(e) => setF('nombre', e.target.value)} disabled={!!editId} />
          </div>
          {/* El selector de ciudad solo lo ve el dueño; el manager va fijo a su ciudad. */}
          {!ciudadBloqueada && (
            <div>
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Ciudad</div>
              <Select className="w-44" value={form.ciudad} onChange={(e) => setF('ciudad', e.target.value)}>
                <option value="">— Elegir ciudad —</option>
                {ciudadesForm.map((c) => (<option key={c.codigo} value={c.codigo}>{c.nombre}</option>))}
              </Select>
            </div>
          )}
          <div>
            <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Monto semanal ($) en esa ciudad</div>
            <Input className="w-40" type="number" step="0.01" min="0" value={form.sueldoSemanal} onChange={(e) => setF('sueldoSemanal', e.target.value)} />
          </div>
          <Boton variant="gold" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : editId ? 'Guardar' : 'Agregar'}</Boton>
          {editId && <Boton variant="ghost" onClick={cancelar}>Cancelar</Boton>}
        </div>
        <p className="mt-2 text-xs text-slate-400">Un mismo gasto que aplica en dos ciudades agrégalo como dos gastos fijos (uno por ciudad) con su propio monto.</p>
      </Card>

      {!ciudadBloqueada && sinCiudad.length > 0 && (
        <Aviso tipo="warn">
          <div className="flex flex-wrap items-center gap-2">
            <span><b>{sinCiudad.length} gasto(s) fijo(s) sin ciudad válida.</b> Su costo NO aparece al filtrar por ciudad (solo en “Todas”). Asígnalos a su ciudad.</span>
            {ciudadesConCodigo.length === 1 && (
              <Boton variant="gold" disabled={reasignando} onClick={() => reasignarTodos(ciudadesConCodigo[0].codigo)} className="px-3 py-1.5 text-xs">
                {reasignando ? 'Asignando…' : `Asignar todos a ${ciudadesConCodigo[0].nombre}`}
              </Boton>
            )}
          </div>
        </Aviso>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Users size={18} strokeWidth={1.8} className="text-brand-gold" />
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Gastos fijos ({managers.length})</h3>
        <Boton variant="ghost" className="px-3 py-1.5 text-xs" onClick={exportarBancarios} disabled={managers.length === 0} title="Descargar nombre, cuenta, ruta y banco de todos">
          <Landmark size={15} strokeWidth={1.8} /> Datos bancarios
        </Boton>
        <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">
          Costo total del periodo ({semanas} sem.): <b className="text-brand-navy dark:text-slate-200">{money(costoTotal)}</b>
        </span>
      </div>

      {grupos.length === 0 ? (
        <Card className="p-4 text-sm text-slate-400">Aún no hay gastos fijos. Agrégalos arriba eligiendo su ciudad; su monto se suma como costo de esa ciudad.</Card>
      ) : (
        <div className="space-y-4">
          {grupos.map((g) => (
            <Card key={g.code || 'sin'} className="p-4">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Building2 size={16} strokeWidth={1.8} className="text-slate-400" />
                <h4 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{g.nombre}{g.code ? <span className="ml-1 text-xs font-normal text-slate-400">({g.code})</span> : null}</h4>
                <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">Costo ciudad ({semanas} sem.): <b className="text-brand-navy dark:text-slate-200">{money(g.costo)}</b></span>
              </div>
              <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <th className="px-3 py-2 text-left font-semibold">Gasto fijo</th>
                      <th className="px-3 py-2 text-right font-semibold">Monto semanal</th>
                      <th className="px-3 py-2 text-center font-semibold">Estado</th>
                      <th className="px-3 py-2 text-right font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((m) => (
                      <tr key={m.id} className="border-t border-slate-100 dark:border-slate-700/50">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            {m.fotoUrl ? (
                              <img src={m.fotoUrl} alt="" className="h-8 w-8 flex-shrink-0 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
                            ) : (
                              <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><Building2 size={15} strokeWidth={1.8} /></span>
                            )}
                            <button onClick={() => navigate(`/managers/${m.id}`)} className="font-medium text-brand-navy hover:underline dark:text-slate-100">{m.nombre}</button>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{money(m.sueldoSemanal)}</td>
                        <td className="px-3 py-2 text-center">{m.activo !== false ? <Badge color="green">Activo</Badge> : <Badge color="slate">Inactivo</Badge>}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-2">
                            <Boton variant="ghost" onClick={() => editar(m)} className="px-2.5 py-1 text-xs">Editar</Boton>
                            <Boton variant="ghost" onClick={() => toggle(m)} className="px-2.5 py-1 text-xs">{m.activo !== false ? 'Desactivar' : 'Activar'}</Boton>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
