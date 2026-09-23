// ============================================================================
// SPEEDX · COBROS Y FONDO — control del dinero que SpeedX nos debe.
//
// SpeedX paga cada semana con ~2 semanas en fondo (semana 01–06 sep → se cobra
// el 25 sep). Esta pantalla lleva:
//   · EN FONDO: la suma de las facturas aún no cobradas (lo que nos deben).
//   · Cada factura: fecha esperada de cobro (editable), marcar cobrada con
//     fecha y monto real, y volverla a pendiente si hubo un error.
//   · GASTOS TEMPORALES por factura: se debitan SOLO de esa factura (un gasto
//     puntual de esa semana). Los GASTOS FIJOS siguen en Choferes → Gastos
//     fijos (managers) y se restan cada semana en Financiero, como siempre.
//
// Solo aparece en el menú con SpeedX activo (soloCarrier en SECCIONES).
// ============================================================================
import { useMemo, useState } from 'react'
import { doc, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { registrarAuditoria } from '../utils/auditoria'
import { money, num } from '../utils/format'
import { conFechas } from '../utils/rango'
import { PiggyBank, CalendarClock, CheckCircle2, Undo2, Plus, Trash2, ChevronDown, ChevronUp, DollarSign, Receipt, AlertTriangle } from 'lucide-react'
import { Card, KPI, PageTitle, Boton, Aviso, Badge, Input } from '../components/ui'
import { useLang } from '../i18n'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const aISO = (d) => {
  const dt = d?.toDate ? d.toDate() : d instanceof Date ? d : null
  return dt ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` : ''
}
const deISO = (iso) => {
  if (!iso) return null
  const [y, m, d] = String(iso).split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12)
}
const fmt = (d) => {
  const dt = d?.toDate ? d.toDate() : d instanceof Date ? d : null
  return dt ? dt.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
}

export default function Cobros() {
  const { t } = useLang()
  const { perfil } = useAuth()
  const { invoices, activeCompanyId, reloadInvoices } = useData()
  const [abierta, setAbierta] = useState(null) // invoiceId expandida (gastos temporales)
  const [gasto, setGasto] = useState({ concepto: '', monto: '' })
  const [cobro, setCobro] = useState({}) // invoiceId → { fecha, monto } del formulario "marcar cobrada"
  const [guardando, setGuardando] = useState('')

  // Las invoices de useData ya vienen filtradas al carrier activo (SpeedX).
  const facturas = useMemo(() => {
    return (invoices || [])
      .filter((i) => i.companyId === activeCompanyId)
      .map((i) => {
        const f = conFechas(i)
        const gastosT = (i.gastosTemporales || []).reduce((a, g) => a + (Number(g.monto) || 0), 0)
        const monto = Number(i.montoACobrar) || Number(i.verificacion?.gofo?.totalGofo) || Number(i.verificacion?.netoCalculado) || 0
        return { ...i, _fechaFin: f.fechaFin, _gastosT: r2(gastosT), _monto: r2(monto) }
      })
      .sort((a, b) => (b._fechaFin?.getTime() || 0) - (a._fechaFin?.getTime() || 0))
  }, [invoices, activeCompanyId])

  const pendientes = facturas.filter((f) => (f.estadoCobro || 'pendiente') !== 'cobrada')
  const cobradas = facturas.filter((f) => (f.estadoCobro || 'pendiente') === 'cobrada')
  const enFondo = r2(pendientes.reduce((a, f) => a + f._monto, 0))
  const totalCobrado = r2(cobradas.reduce((a, f) => a + (Number(f.montoCobrado) || f._monto), 0))
  const proximo = pendientes
    .map((f) => ({ f, d: f.fechaEsperadaCobro?.toDate ? f.fechaEsperadaCobro.toDate() : f.fechaEsperadaCobro }))
    .filter((x) => x.d)
    .sort((a, b) => a.d - b.d)[0]
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  const atrasadas = pendientes.filter((f) => {
    const d = f.fechaEsperadaCobro?.toDate ? f.fechaEsperadaCobro.toDate() : f.fechaEsperadaCobro
    return d && d < hoy
  })

  const audit = (accion, inv, detalle, monto) => registrarAuditoria(activeCompanyId, {
    accion, usuario: perfil?.email || perfil?.nombre || 'usuario', rol: perfil?.role || '',
    entidad: `SpeedX · ${inv.semanaSpeedX || inv.semana}`, detalle, semana: inv.semana || '', ...(monto != null ? { monto } : {}),
  })

  const cambiarFechaEsperada = async (inv, iso) => {
    const d = deISO(iso)
    if (!d) return
    setGuardando(inv.id)
    try {
      await updateDoc(doc(db, 'invoices', inv.id), { fechaEsperadaCobro: d })
      await reloadInvoices()
    } finally { setGuardando('') }
  }

  const marcarCobrada = async (inv) => {
    const c = cobro[inv.id] || {}
    const fecha = deISO(c.fecha) || new Date()
    const monto = c.monto !== undefined && c.monto !== '' ? r2(c.monto) : inv._monto
    setGuardando(inv.id)
    try {
      await updateDoc(doc(db, 'invoices', inv.id), { estadoCobro: 'cobrada', fechaCobro: fecha, montoCobrado: monto })
      audit('pago_marcado', inv, `Semana SpeedX ${inv.semanaSpeedX || inv.semana} cobrada (${money(monto)})`, monto)
      await reloadInvoices()
      setCobro((x) => ({ ...x, [inv.id]: undefined }))
    } finally { setGuardando('') }
  }

  const volverPendiente = async (inv) => {
    setGuardando(inv.id)
    try {
      await updateDoc(doc(db, 'invoices', inv.id), { estadoCobro: 'pendiente', fechaCobro: null, montoCobrado: null })
      audit('pago_desmarcado', inv, `Semana SpeedX ${inv.semanaSpeedX || inv.semana} vuelve a PENDIENTE de cobro`)
      await reloadInvoices()
    } finally { setGuardando('') }
  }

  const agregarGasto = async (inv) => {
    const concepto = (gasto.concepto || '').trim()
    const monto = r2(gasto.monto)
    if (!concepto || !(monto > 0)) return
    setGuardando(inv.id)
    try {
      const lista = [...(inv.gastosTemporales || []), { id: `${Date.now()}`, concepto, monto, fecha: new Date().toISOString(), por: perfil?.nombre || perfil?.email || '' }]
      await updateDoc(doc(db, 'invoices', inv.id), { gastosTemporales: lista })
      audit('ajuste_guardado', inv, `Gasto temporal "${concepto}" (${money(monto)}) en la semana ${inv.semanaSpeedX || inv.semana}`, monto)
      await reloadInvoices()
      setGasto({ concepto: '', monto: '' })
    } finally { setGuardando('') }
  }

  const quitarGasto = async (inv, id) => {
    setGuardando(inv.id)
    try {
      await updateDoc(doc(db, 'invoices', inv.id), { gastosTemporales: (inv.gastosTemporales || []).filter((g) => g.id !== id) })
      await reloadInvoices()
    } finally { setGuardando('') }
  }

  return (
    <div>
      <PageTitle>
        <span className="inline-flex items-center gap-2"><PiggyBank size={22} /> {t('Cobros y fondo')} <Badge color="navy">SpeedX</Badge></span>
      </PageTitle>
      <p className="mb-4 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
        {t('SpeedX paga cada semana con ~2 semanas en fondo. Aquí ves cuánto dinero te deben (en fondo), cuándo toca cada cobro y lo marcas como cobrado cuando el dinero llega. Los gastos temporales se descuentan solo de su factura; los gastos fijos siguen en Choferes → Gastos fijos.')}
      </p>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KPI label={t('En fondo (nos deben)')} value={money(enFondo)} icon={PiggyBank} accent="gold" sub={`${pendientes.length} ${t('semana(s) pendientes')}`} />
        <KPI label={t('Próximo cobro')} value={proximo ? fmt(proximo.d) : '—'} icon={CalendarClock} sub={proximo ? money(proximo.f._monto) : t('nada pendiente')} />
        <KPI label={t('Cobrado (histórico)')} value={money(totalCobrado)} icon={DollarSign} accent="green" sub={`${cobradas.length} ${t('semana(s)')}`} />
        <KPI label={t('Cobros atrasados')} value={num(atrasadas.length)} icon={AlertTriangle} accent={atrasadas.length ? 'red' : 'navy'} sub={atrasadas.length ? t('pasó la fecha esperada') : t('todo al día')} />
      </div>

      {atrasadas.length > 0 && (
        <Aviso tipo="warn" className="mb-4">
          <b>{t('Ojo:')}</b> {atrasadas.length} {t('semana(s) ya pasaron su fecha esperada de cobro y siguen pendientes:')} {atrasadas.slice(0, 3).map((f) => f.semanaSpeedX || f.semana).join(', ')}{atrasadas.length > 3 ? '…' : ''}. {t('Reclama a SpeedX o ajusta la fecha si te confirmaron otro día.')}
        </Aviso>
      )}

      {facturas.length === 0 && (
        <Card><p className="py-6 text-center text-slate-400">{t('Aún no hay facturas de SpeedX. Carga la primera en «Cargar Factura».')}</p></Card>
      )}

      <div className="space-y-3">
        {facturas.map((inv) => {
          const cobrada = (inv.estadoCobro || 'pendiente') === 'cobrada'
          const dEsp = inv.fechaEsperadaCobro?.toDate ? inv.fechaEsperadaCobro.toDate() : inv.fechaEsperadaCobro
          const atrasada = !cobrada && dEsp && dEsp < hoy
          const abiertaEsta = abierta === inv.id
          const netoTrasGastos = r2((cobrada ? (Number(inv.montoCobrado) || inv._monto) : inv._monto) - inv._gastosT)
          const c = cobro[inv.id] || {}
          return (
            <Card key={inv.id} className={atrasada ? 'border-amber-400/60' : ''}>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl ${cobrada ? 'bg-emerald-500/15 text-emerald-600' : 'bg-brand-navy/10 text-brand-navy dark:bg-slate-700 dark:text-slate-200'}`}>
                  {cobrada ? <CheckCircle2 size={19} /> : <PiggyBank size={19} />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-bold text-brand-navy dark:text-slate-100">
                    {t('Semana')} {inv.semanaSpeedX || inv.semana}
                    <Badge color={cobrada ? 'green' : atrasada ? 'red' : 'gold'}>{cobrada ? t('COBRADA') : atrasada ? t('ATRASADA') : t('EN FONDO')}</Badge>
                    {inv._gastosT > 0 && <Badge color="slate">{t('gastos temp.')} −{money(inv._gastosT)}</Badge>}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {t('Trabajada')}: {fmt(inv.fechaInicio)} – {fmt(inv._fechaFin || inv.fechaFin)} · {num(inv.totalPaquetes || 0)} {t('paquetes')} · {inv.archivoNombre || ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-extrabold text-brand-navy dark:text-slate-100">{money(cobrada ? (Number(inv.montoCobrado) || inv._monto) : inv._monto)}</div>
                  <div className="text-[11px] text-slate-400">{cobrada ? `${t('cobrada el')} ${fmt(inv.fechaCobro)}` : `${t('se espera el')} ${fmt(dEsp)}`}</div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm dark:border-slate-700/60">
                {!cobrada && (
                  <>
                    <span className="text-slate-500 dark:text-slate-400">{t('Fecha esperada:')}</span>
                    <Input type="date" className="w-40" value={aISO(dEsp)} onChange={(e) => cambiarFechaEsperada(inv, e.target.value)} disabled={guardando === inv.id} />
                    <span className="mx-1 hidden text-slate-300 sm:inline">|</span>
                    <span className="text-slate-500 dark:text-slate-400">{t('¿Llegó el dinero?')}</span>
                    <Input type="date" className="w-40" value={c.fecha || aISO(new Date())} onChange={(e) => setCobro((x) => ({ ...x, [inv.id]: { ...c, fecha: e.target.value } }))} />
                    <Input type="number" step="0.01" min="0" className="w-32" placeholder={String(inv._monto)} value={c.monto ?? ''} onChange={(e) => setCobro((x) => ({ ...x, [inv.id]: { ...c, monto: e.target.value } }))} />
                    <Boton onClick={() => marcarCobrada(inv)} disabled={guardando === inv.id}><CheckCircle2 size={15} /> {t('Marcar cobrada')}</Boton>
                  </>
                )}
                {cobrada && (
                  <Boton variant="ghost" onClick={() => volverPendiente(inv)} disabled={guardando === inv.id}><Undo2 size={15} /> {t('Volver a pendiente')}</Boton>
                )}
                <span className="flex-1" />
                <button onClick={() => setAbierta(abiertaEsta ? null : inv.id)} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-navy transition hover:opacity-80 dark:text-slate-200">
                  <Receipt size={15} /> {t('Gastos temporales')} ({(inv.gastosTemporales || []).length}) {abiertaEsta ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              </div>

              {abiertaEsta && (
                <div className="mt-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">{t('Gastos puntuales de ESTA semana (una multa, una renta de van por unos días, etc.). Se restan solo de esta factura; no se repiten cada semana como los gastos fijos.')}</p>
                  {(inv.gastosTemporales || []).length > 0 && (
                    <ul className="mb-2 divide-y divide-slate-200 text-sm dark:divide-slate-700">
                      {inv.gastosTemporales.map((g) => (
                        <li key={g.id} className="flex items-center gap-2 py-1.5">
                          <span className="flex-1">{g.concepto}</span>
                          <b className="text-rose-600 dark:text-rose-400">−{money(g.monto)}</b>
                          <button onClick={() => quitarGasto(inv, g.id)} className="text-slate-400 transition hover:text-rose-500" title={t('Quitar')}><Trash2 size={15} /></button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="w-56" placeholder={t('Concepto (p. ej. renta de van)')} value={abiertaEsta ? gasto.concepto : ''} onChange={(e) => setGasto((g) => ({ ...g, concepto: e.target.value }))} />
                    <Input type="number" step="0.01" min="0" className="w-28" placeholder="$" value={abiertaEsta ? gasto.monto : ''} onChange={(e) => setGasto((g) => ({ ...g, monto: e.target.value }))} />
                    <Boton variant="ghost" onClick={() => agregarGasto(inv)} disabled={guardando === inv.id}><Plus size={15} /> {t('Agregar')}</Boton>
                    <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">{t('Neto de esta factura tras gastos temporales:')} <b className="text-brand-navy dark:text-slate-100">{money(netoTrasGastos)}</b></span>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
