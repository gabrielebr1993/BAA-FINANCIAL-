// Gestión de las ciudades propias de la empresa (settings/{companyId}.ciudades).
import { useState } from 'react'
import { MapPin, Plus, Trash2, Check, X, Pencil } from 'lucide-react'
import { useData } from '../DataContext'
import { guardarCiudadesEmpresa } from '../utils/empresaSettings'
import { Card, Boton, Input, Aviso } from './ui'

export default function MisCiudades({ enTarjeta = true }) {
  const { activeCompanyId, ciudadesEmpresa, reloadAjustes } = useData()
  const [nuevo, setNuevo] = useState({ nombre: '', codigo: '' })
  const [editando, setEditando] = useState(null) // índice
  const [editForm, setEditForm] = useState({ nombre: '', codigo: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const persistir = async (lista) => {
    setGuardando(true); setError('')
    try { await guardarCiudadesEmpresa(activeCompanyId, lista); await reloadAjustes() }
    catch (e) { setError('No se pudo guardar: ' + e.message) }
    finally { setGuardando(false) }
  }

  const agregar = async () => {
    const nombre = nuevo.nombre.trim()
    const codigo = nuevo.codigo.trim().toUpperCase()
    if (!nombre) return setError('Escribe el nombre de la ciudad.')
    if (ciudadesEmpresa.some((c) => c.nombre.toLowerCase() === nombre.toLowerCase() || (codigo && c.codigo === codigo)))
      return setError('Esa ciudad (o código) ya existe.')
    await persistir([...ciudadesEmpresa, { nombre, codigo }])
    setNuevo({ nombre: '', codigo: '' })
  }
  const eliminar = (i) => persistir(ciudadesEmpresa.filter((_, j) => j !== i))
  const abrirEdicion = (i) => { setEditando(i); setEditForm({ ...ciudadesEmpresa[i] }); setError('') }
  const guardarEdicion = async () => {
    const nombre = editForm.nombre.trim(); const codigo = (editForm.codigo || '').trim().toUpperCase()
    if (!nombre) return setError('El nombre no puede quedar vacío.')
    const lista = ciudadesEmpresa.map((c, j) => (j === editando ? { nombre, codigo } : c))
    await persistir(lista)
    setEditando(null)
  }

  const cuerpo = (
    <>
      <div className="mb-2 flex items-center gap-2">
        <MapPin size={18} strokeWidth={1.8} className="text-brand-gold" />
        <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Mis ciudades</h3>
        <span className="ml-auto text-xs text-slate-400">{ciudadesEmpresa.length} ciudad(es)</span>
      </div>
      {error && <Aviso tipo="error">{error}</Aviso>}

      {ciudadesEmpresa.length === 0 ? (
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Aún no tienes ciudades. Agrega al menos una para poder cargar facturas.</p>
      ) : (
        <div className="mb-3 space-y-2">
          {ciudadesEmpresa.map((c, i) => (
            <div key={`${c.codigo}-${c.nombre}-${i}`} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-700/60">
              {editando === i ? (
                <>
                  <Input className="w-40" value={editForm.nombre} onChange={(e) => setEditForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Nombre" />
                  <Input className="w-28" value={editForm.codigo} onChange={(e) => setEditForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="Código" />
                  <div className="ml-auto flex gap-2">
                    <Boton variant="success" disabled={guardando} onClick={guardarEdicion} className="px-2.5 py-1 text-xs"><Check size={13} strokeWidth={2.2} /></Boton>
                    <Boton variant="ghost" onClick={() => setEditando(null)} className="px-2.5 py-1 text-xs"><X size={13} strokeWidth={2.2} /></Boton>
                  </div>
                </>
              ) : (
                <>
                  <span className="font-medium text-brand-navy dark:text-slate-100">{c.nombre}</span>
                  {c.codigo && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-300">{c.codigo}</span>}
                  <div className="ml-auto flex gap-1.5">
                    <Boton variant="ghost" onClick={() => abrirEdicion(i)} className="px-2 py-1 text-xs"><Pencil size={13} strokeWidth={1.8} /></Boton>
                    <Boton variant="ghost" disabled={guardando} onClick={() => eliminar(i)} className="px-2 py-1 text-xs text-rose-600"><Trash2 size={13} strokeWidth={1.8} /></Boton>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Nombre *</div>
          <Input className="w-40" value={nuevo.nombre} onChange={(e) => setNuevo((n) => ({ ...n, nombre: e.target.value }))} placeholder="Ej. Dallas" />
        </div>
        <div>
          <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Código / prefijo</div>
          <Input className="w-32" value={nuevo.codigo} onChange={(e) => setNuevo((n) => ({ ...n, codigo: e.target.value }))} placeholder="Ej. DFW01" />
        </div>
        <Boton variant="gold" disabled={guardando} onClick={agregar}><Plus size={16} strokeWidth={1.8} /> Agregar ciudad</Boton>
      </div>
    </>
  )

  return enTarjeta ? <Card className="p-5">{cuerpo}</Card> : cuerpo
}
