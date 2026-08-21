import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Trash2, Truck, Check, Pencil } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, guardar, eliminar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { PageTitle, Card, Boton, Input, Badge, Cargando, EstadoVacio } from '../../components/ui'
import { Gate } from '../components/Gate'
import { UserId } from '../components/UserId'
import { useLang } from '../../i18n'

export default function Transportistas() {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { datos: carriers, cargando } = useColeccion('carriers')
  const { datos: equipos } = useColeccion('equipment')
  const [form, setForm] = useState({ nombre: '', contacto: '', equipos: [] })
  const [ocupado, setOcupado] = useState(false)
  const [editando, setEditando] = useState(null) // id del transportista al que se le editan equipos

  const tiposActivos = equipos.filter((e) => e.activo !== false)
  const toggleEquipo = (nombre) => setForm((f) => ({ ...f, equipos: f.equipos.includes(nombre) ? f.equipos.filter((x) => x !== nombre) : [...f.equipos, nombre] }))
  // Agrega/quita un equipo a un transportista YA creado y lo guarda al instante.
  const toggleEquipoCarrier = async (c, nombre) => {
    const actuales = c.equipos || []
    const nuevos = actuales.includes(nombre) ? actuales.filter((x) => x !== nombre) : [...actuales, nombre]
    await guardar('carriers', c.id, { equipos: nuevos })
  }

  const agregar = async () => {
    if (!form.nombre.trim()) return
    setOcupado(true)
    await crear('carriers', tenantId, { nombre: form.nombre.trim(), contacto: form.contacto.trim(), equipos: form.equipos, activo: true })
    setForm({ nombre: '', contacto: '', equipos: [] }); setOcupado(false)
  }
  const borrar = async (c) => { if (window.confirm(`${t('¿Eliminar transportista')} "${c.nombre}"?`)) await eliminar('carriers', c.id) }

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>{t('Transportistas')}</PageTitle>
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo transportista')}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input placeholder={t('Nombre / empresa')} value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} />
          <Input placeholder={t('Contacto (tel / email)')} value={form.contacto} onChange={(e) => setForm((f) => ({ ...f, contacto: e.target.value }))} />
        </div>
        <div className="mt-3">
          <div className="mb-1.5 text-xs font-semibold uppercase text-slate-400">{t('Tipos de equipo disponibles')}</div>
          {tiposActivos.length === 0 ? (
            <p className="text-xs text-slate-400">{t('Primero crea tipos de equipo en el catálogo.')}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {tiposActivos.map((t) => (
                <button key={t.id} onClick={() => toggleEquipo(t.nombre)} type="button"
                  className={`rounded-lg border px-3 py-1.5 text-sm transition ${form.equipos.includes(t.nombre) ? 'border-amber-500 bg-amber-500/15 font-semibold text-amber-700 dark:text-amber-300' : 'border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
                  {t.nombre}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mt-3"><Gate perm="transportistas.crear"><Boton variant="gold" onClick={agregar} disabled={ocupado || !form.nombre.trim()}><Plus size={16} /> {t('Agregar transportista')}</Boton></Gate></div>
      </Card>

      {carriers.length === 0 ? <EstadoVacio titulo={t('Sin transportistas')} texto={t('Agrega el primero arriba.')} mostrarBoton={false} /> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {carriers.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="mb-1 flex items-center gap-2">
                <Truck size={17} className="text-amber-500" />
                <Link to={`/bulk/transportistas/${c.id}`} className="font-bold text-brand-navy hover:text-amber-600 hover:underline dark:text-slate-100">{c.nombre}</Link>
                <Gate perm="transportistas.eliminar"><button onClick={() => borrar(c)} className="ml-auto text-rose-400 hover:text-rose-600"><Trash2 size={15} /></button></Gate>
              </div>
              <div className="mb-1"><UserId codigo={c.codigo} /></div>
              {c.contacto && <div className="mb-2 text-xs text-slate-400">{c.contacto}</div>}
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('Equipos')}</span>
                <button onClick={() => setEditando(editando === c.id ? null : c.id)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600 hover:underline"><Pencil size={11} /> {editando === c.id ? t('Listo') : t('Editar')}</button>
              </div>
              {editando === c.id ? (
                tiposActivos.length === 0 ? <p className="text-xs text-slate-400">{t('Crea tipos de equipo en el catálogo.')}</p> : (
                  <div className="flex flex-wrap gap-1.5">
                    {tiposActivos.map((eq) => {
                      const on = (c.equipos || []).includes(eq.nombre)
                      return (
                        <button key={eq.id} type="button" onClick={() => toggleEquipoCarrier(c, eq.nombre)}
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition ${on ? 'border-amber-500 bg-amber-500 text-white' : 'border-slate-300 text-slate-500 hover:border-amber-400 dark:border-slate-600 dark:text-slate-300'}`}>
                          {on && <Check size={11} strokeWidth={3} />} {eq.nombre}
                        </button>
                      )
                    })}
                  </div>
                )
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {(c.equipos || []).length ? (c.equipos || []).map((e) => <Badge key={e} color="navy">{e}</Badge>) : <span className="text-xs text-slate-400">{t('Sin equipos — toca Editar para agregar')}</span>}
                </div>
              )}
              <Link to={`/bulk/transportistas/${c.id}`} className="mt-2 inline-block text-xs font-semibold text-amber-600 hover:underline">{t('Ver perfil')} →</Link>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
