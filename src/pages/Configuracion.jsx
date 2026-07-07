import { useState, useEffect } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { Save, Info } from 'lucide-react'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { CLAIM_FEE, UMBRAL_CAMBIO_PRECIO, CIUDADES } from '../constants'
import { pct } from '../utils/format'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Spinner } from '../components/ui'

export default function Configuracion() {
  const { activeCompanyId, empresaActiva } = useData()
  const [marca, setMarca] = useState('')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState('')

  useEffect(() => {
    ;(async () => {
      if (!activeCompanyId) return
      try {
        const s = await getDoc(doc(db, 'settings', activeCompanyId))
        if (s.exists()) { setMarca(s.data().marca || ''); setNotas(s.data().notas || '') }
      } catch { /* noop */ }
    })()
  }, [activeCompanyId])

  const guardar = async () => {
    if (!activeCompanyId) return
    setGuardando(true)
    setOk('')
    try {
      await setDoc(doc(db, 'settings', activeCompanyId), { marca, notas, actualizadoEn: serverTimestamp() }, { merge: true })
      setOk('Configuración guardada.')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">Empresa: <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>Configuración</PageTitle>

      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Reglas de negocio (fijas) */}
        <Card className="p-5">
          <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Reglas de negocio</h3>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Descuento por claim (CLAIM_FEE)</span>
              <span className="font-semibold">${CLAIM_FEE} <Badge color="slate">fijo</Badge></span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Umbral de alerta de cambio de precio</span>
              <span className="font-semibold">{pct(UMBRAL_CAMBIO_PRECIO, 0)} <Badge color="slate">fijo</Badge></span>
            </li>
            <li className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-300">Clasificación de doble</span>
              <span className="font-semibold">monto = $0.50 <Badge color="slate">fijo</Badge></span>
            </li>
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Info size={15} strokeWidth={1.8} className="mt-0.5 flex-shrink-0" />
            Estas reglas están validadas con Gofo y son fijas para no afectar los cálculos ni la verificación al centavo.
          </div>
        </Card>

        {/* Ciudades / almacenes */}
        <Card className="p-5">
          <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Ciudades / almacenes</h3>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CIUDADES).map(([codigo, nombre]) => (
              <span key={codigo} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700 dark:bg-slate-700/50 dark:text-slate-200">
                {nombre} <span className="text-slate-400">({codigo})</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">Puedes agregar ciudades nuevas al cargar una factura (se detectan por el prefijo de la ruta).</p>
        </Card>

        {/* Marca de la empresa (editable) */}
        <Card className="p-5 lg:col-span-2">
          <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Datos de la empresa</h3>
          <div className="flex flex-wrap gap-4">
            <div>
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Nombre de marca</div>
              <Input className="w-64" value={marca} onChange={(e) => setMarca(e.target.value)} placeholder={empresaActiva?.nombre || 'Gofo'} />
            </div>
            <div className="flex-1 min-w-[240px]">
              <div className="mb-1 text-xs text-slate-500 dark:text-slate-400">Notas internas</div>
              <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-gold dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100" />
            </div>
          </div>
          <div className="mt-3">
            <Boton variant="gold" onClick={guardar} disabled={guardando || !activeCompanyId}>
              {guardando ? <><Spinner /> Guardando…</> : <><Save size={16} strokeWidth={1.8} /> Guardar configuración</>}
            </Boton>
          </div>
        </Card>
      </div>
    </div>
  )
}
