import { useState } from 'react'
import { AlertTriangle, Plus, Camera, Send } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, guardar, ref } from '../data/repo'
import { updateDoc, arrayUnion } from 'firebase/firestore'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { leerFotoReducida } from '../components/foto'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, EstadoVacio, Aviso } from '../../components/ui'

const TIPOS = ['accidente', 'retraso', 'daño', 'otro']
const ESTADOS = { abierta: 'red', en_proceso: 'gold', resuelta: 'green' }

export default function Incidencias() {
  const { tenantId, usuario, rol } = useBulkAuth()
  const { datos: incidencias, cargando } = useColeccion('incidents')
  const [f, setF] = useState({ tipo: 'retraso', orden: '', descripcion: '', responsable: '', foto: null })
  const [nota, setNota] = useState({})
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const crearInc = async () => {
    if (!f.descripcion.trim()) return
    await crear('incidents', tenantId, {
      tipo: f.tipo, orden: f.orden.trim(), descripcion: f.descripcion.trim(), responsable: f.responsable.trim(),
      fotos: f.foto ? [f.foto] : [], estado: 'abierta', seguimiento: [], ts: new Date().toISOString(),
      creadaPor: usuario?.nombre || usuario?.email,
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'crear_incidencia', entidad: 'incidencia', detalle: `${f.tipo}: ${f.descripcion.slice(0, 40)}` })
    setF({ tipo: 'retraso', orden: '', descripcion: '', responsable: '', foto: null })
  }
  const cambiarEstado = async (inc, estado) => { await guardar('incidents', inc.id, { estado }) }
  const agregarNota = async (inc) => {
    const t = (nota[inc.id] || '').trim(); if (!t) return
    await updateDoc(ref('incidents', inc.id), { seguimiento: arrayUnion({ nota: t, por: usuario?.nombre || usuario?.email, ts: new Date().toISOString() }) })
    setNota((s) => ({ ...s, [inc.id]: '' }))
  }
  const subirFoto = async (e) => { const foto = await leerFotoReducida(e.target.files?.[0]); setF((s) => ({ ...s, foto })) }

  if (cargando) return <Cargando />
  const abiertas = incidencias.filter((i) => i.estado !== 'resuelta')

  return (
    <div>
      <PageTitle>Centro de incidencias</PageTitle>
      {abiertas.length > 0 && <Aviso tipo="warn" className="mb-3">{abiertas.length} incidencia(s) sin resolver.</Aviso>}

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">Reportar incidencia</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select value={f.tipo} onChange={set('tipo')}>{TIPOS.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
          <Input placeholder="Orden (opcional)" value={f.orden} onChange={set('orden')} />
          <Input placeholder="Responsable" value={f.responsable} onChange={set('responsable')} />
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 text-sm text-slate-500 dark:border-slate-600"><Camera size={16} /> {f.foto ? 'Foto ✓' : 'Foto'}<input type="file" accept="image/*" onChange={subirFoto} className="hidden" /></label>
        </div>
        <Input placeholder="Descripción de lo ocurrido…" value={f.descripcion} onChange={set('descripcion')} className="mt-3" />
        <div className="mt-3"><Boton variant="gold" onClick={crearInc} disabled={!f.descripcion.trim()}><Plus size={16} /> Registrar</Boton></div>
      </Card>

      {incidencias.length === 0 ? <EstadoVacio titulo="Sin incidencias" texto="Registra accidentes, retrasos o daños para darles seguimiento." mostrarBoton={false} /> : (
        <div className="space-y-3">
          {incidencias.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((inc) => (
            <Card key={inc.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle size={16} className="text-amber-500" />
                <span className="font-semibold capitalize text-brand-navy dark:text-slate-100">{inc.tipo}</span>
                {inc.orden && <Badge color="slate">{inc.orden}</Badge>}
                <Badge color={ESTADOS[inc.estado]}>{inc.estado}</Badge>
                <span className="ml-auto text-xs text-slate-400">{new Date(inc.ts).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}</span>
              </div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{inc.descripcion}</div>
              {inc.responsable && <div className="text-xs text-slate-400">Responsable: {inc.responsable}</div>}
              {(inc.fotos || []).length > 0 && <img src={inc.fotos[0]} alt="incidencia" className="mt-2 max-h-40 rounded-lg" />}
              {(inc.seguimiento || []).length > 0 && (
                <div className="mt-2 space-y-1 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
                  {inc.seguimiento.map((s, i) => <div key={i} className="text-xs text-slate-500"><b>{s.por}</b> · {new Date(s.ts).toLocaleString('es', { dateStyle: 'short', timeStyle: 'short' })}: {s.nota}</div>)}
                </div>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Input className="flex-1" placeholder="Agregar nota de seguimiento…" value={nota[inc.id] || ''} onChange={(e) => setNota((s) => ({ ...s, [inc.id]: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && agregarNota(inc)} />
                <button onClick={() => agregarNota(inc)} className="rounded-lg bg-slate-100 p-2 text-slate-600 dark:bg-slate-800"><Send size={15} /></button>
                {inc.estado !== 'resuelta' && (
                  <Select value={inc.estado} onChange={(e) => cambiarEstado(inc, e.target.value)} className="py-1 text-xs">
                    {Object.keys(ESTADOS).map((s) => <option key={s} value={s}>{s}</option>)}
                  </Select>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
