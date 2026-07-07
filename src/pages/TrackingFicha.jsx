import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { ArrowLeft, Package, Truck, MapPin, Scale, Calendar, DollarSign, Search, CheckCircle2 } from 'lucide-react'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { perdonarClaim, quitarPerdon } from '../utils/claims'
import { etiquetaTipoClaim } from '../utils/calc'
import { nombreCiudad } from '../constants'
import { money, num } from '../utils/format'
import { Card, PageTitle, Boton, Badge, Input, Cargando, EstadoVacio } from '../components/ui'

export default function TrackingFicha() {
  const { waybill } = useParams()
  const decoded = decodeURIComponent(waybill || '').trim()
  const navigate = useNavigate()
  const { perfil } = useAuth()
  const { activeCompanyId } = useData()

  const [rows, setRows] = useState(null) // null = cargando, [] = sin incidencias
  const [ocupado, setOcupado] = useState(false)
  const [perdonandoId, setPerdonandoId] = useState(null)
  const [motivo, setMotivo] = useState('')

  const cargar = useMemo(
    () => async () => {
      if (!activeCompanyId || !decoded) { setRows([]); return }
      const snap = await getDocs(query(collection(db, 'claims'), where('companyId', '==', activeCompanyId), where('waybill', '==', decoded)))
      setRows(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    },
    [activeCompanyId, decoded]
  )

  useEffect(() => { setRows(null); cargar().catch(() => setRows([])) }, [cargar])

  const historial = useMemo(() => {
    if (!rows) return []
    return [...rows].sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  }, [rows])

  const paquete = historial[0] || null

  const confirmarPerdon = async (row) => {
    setOcupado(true)
    await perdonarClaim(row, motivo, perfil)
    setPerdonandoId(null); setMotivo('')
    await cargar()
    setOcupado(false)
  }
  const restaurar = async (row) => {
    setOcupado(true)
    await quitarPerdon(row)
    await cargar()
    setOcupado(false)
  }

  const Dato = ({ icon: Icon, label, valor }) => (
    <div className="flex items-start gap-2">
      <Icon size={16} strokeWidth={1.8} className="mt-0.5 flex-shrink-0 text-slate-400" />
      <div>
        <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
        <div className="text-sm font-medium text-brand-navy dark:text-slate-100">{valor}</div>
      </div>
    </div>
  )

  return (
    <div>
      <PageTitle>
        <button onClick={() => navigate(-1)} className="mr-2 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-brand-navy dark:hover:text-white">
          <ArrowLeft size={16} strokeWidth={2} /> Volver
        </button>
        Ficha de tracking
      </PageTitle>

      {rows === null ? (
        <Cargando texto="Buscando el tracking…" />
      ) : rows.length === 0 ? (
        <EstadoVacio titulo={decoded || 'Tracking'} texto="Este paquete no tiene incidencias registradas. Solo guardamos los paquetes que tienen algún claim." mostrarBoton={false} />
      ) : (
        <>
          {/* Cabecera con el tracking */}
          <Card className="mb-4 p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-navy text-brand-gold"><Package size={24} strokeWidth={1.8} /></div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Tracking (Waybill No.)</div>
                <div className="font-mono text-2xl font-bold text-brand-navy dark:text-slate-100">{decoded}</div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-[11px] uppercase tracking-wide text-slate-400">Responsable</div>
                <Link to={`/choferes/${encodeURIComponent(paquete?.courier || '')}`} className="inline-flex items-center gap-1.5 text-lg font-bold text-brand-navy hover:underline dark:text-brand-gold">
                  <Truck size={18} strokeWidth={1.8} /> {paquete?.courier || '—'}
                </Link>
              </div>
            </div>
          </Card>

          {/* Datos del paquete */}
          <Card className="mb-4 p-5">
            <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Datos del paquete</h3>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              <Dato icon={MapPin} label="Ruta" valor={paquete?.ruta || '—'} />
              <Dato icon={MapPin} label="Ciudad" valor={paquete?.ciudad ? nombreCiudad(paquete.ciudad) : '—'} />
              <Dato icon={MapPin} label="Código postal" valor={paquete?.postalCode || '—'} />
              <Dato icon={Scale} label="Peso (lb)" valor={paquete?.peso != null ? num(paquete.peso, 1) : '—'} />
              <Dato icon={Scale} label="Rango de peso" valor={paquete?.rangoPeso || '—'} />
              <Dato icon={DollarSign} label="Monto de entrega (Gofo)" valor={paquete?.montoEntrega != null ? money(paquete.montoEntrega) : '—'} />
              <Dato icon={Calendar} label="Fecha" valor={paquete?.date || '—'} />
            </div>
            <p className="mt-3 text-xs text-slate-400">La ciudad de destino y el tipo de firma no vienen en la factura de Gofo, por eso no se muestran.</p>
          </Card>

          {/* Historial / incidencias */}
          <Card className="p-5">
            <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Historial de incidencias ({historial.length})</h3>
            <div className="space-y-3">
              {historial.map((c) => {
                const estado = c.estadoRevision === 'anulado' ? { txt: 'Anulado', color: 'slate' } : c.perdonado ? { txt: 'Perdonado', color: 'green' } : c.estadoRevision === 'pendiente' ? { txt: 'Repetido · pendiente', color: 'gold' } : { txt: 'Activo', color: 'red' }
                return (
                  <div key={c.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="font-semibold text-brand-navy dark:text-slate-100">{etiquetaTipoClaim(c.claimType)}</span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">{c.date || 'sin fecha'}</span>
                      <span className={`text-sm font-semibold ${Number(c.montoGofo) < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>Gofo: {money(c.montoGofo)}</span>
                      <Badge color={estado.color}>{estado.txt}</Badge>
                      {c.perdonado && c.motivo && <span className="text-xs text-slate-400" title={c.motivo}>“{c.motivo}”</span>}
                      <div className="ml-auto">
                        {perdonandoId === c.id ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Input autoFocus className="w-40" placeholder="Motivo…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                            <Boton variant="success" disabled={ocupado} onClick={() => confirmarPerdon(c)} className="px-2.5 py-1 text-xs">OK</Boton>
                            <Boton variant="ghost" onClick={() => { setPerdonandoId(null); setMotivo('') }} className="px-2.5 py-1 text-xs">✕</Boton>
                          </span>
                        ) : c.perdonado ? (
                          <Boton variant="ghost" disabled={ocupado} onClick={() => restaurar(c)} className="px-2.5 py-1 text-xs">Quitar perdón</Boton>
                        ) : c.estadoRevision === 'anulado' ? (
                          <span className="text-xs text-slate-400">Sin acciones (anulado)</span>
                        ) : (
                          <Boton variant="ghost" onClick={() => { setPerdonandoId(c.id); setMotivo('') }} className="px-2.5 py-1 text-xs">Perdonar</Boton>
                        )}
                      </div>
                    </div>
                    {c.perdonado && (
                      <div className="mt-1.5 inline-flex items-center gap-1 text-xs text-rose-600 dark:text-rose-400">
                        <CheckCircle2 size={12} strokeWidth={2} /> Perdonado: absorbes {money(Math.abs(Number(c.montoGofo) || 0))} (solo lo de Gofo; los $100 son una multa que dejas de cobrar).
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  )
}
