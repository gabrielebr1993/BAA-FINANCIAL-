import { useState, useMemo, useRef } from 'react'
import { updateDoc, doc } from 'firebase/firestore'
import { useNavigate } from 'react-router-dom'
import {
  Trash2, AlertTriangle, Scale, Upload, Search, X, FileText, DollarSign, Package,
  Truck, Route as RouteIcon, TrendingUp, Download, Filter, Layers, Users, MapPin,
  ExternalLink, Receipt, CheckCircle2, CalendarDays, ArrowUpDown, Percent,
} from 'lucide-react'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { useLang } from '../i18n'
import {
  nombreCiudadDe, TODAS, contarClaimsValidos, gananciaRealDe, porCiudad,
} from '../utils/calc'
import { procesarArchivo, combinarArchivos } from '../utils/excel'
import { eliminarFacturaCascada } from '../utils/borrado'
import { registrarAuditoria } from '../utils/auditoria'
import { exportarExcel } from '../utils/exportar'
import { money, num, pct } from '../utils/format'
import { Card, PageTitle, Boton, Badge, Aviso, Spinner, KPI, EstadoVacio, Cargando } from '../components/ui'

// ── Helpers de presentación ────────────────────────────────────────────────
const PALETA = ['bg-brand-navy', 'bg-brand-steel', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-violet-500']
const colorDe = (s) => PALETA[[...String(s || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETA.length]
const inicialesDe = (s) => String(s || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?'
// "22_06_2026-28_06_2026" → "22/06/2026 – 28/06/2026"
const semanaLabel = (semana) => String(semana || '').split('-').map((p) => p.replace(/_/g, '/')).join(' – ') || '—'
const fFecha = (ts) => {
  try {
    const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : (typeof ts === 'string' ? new Date(ts) : null))
    return d && !isNaN(d) ? d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
  } catch { return '—' }
}
const tieneDesglose = (inv) => ((inv.simuladorDesglose || inv.resumenRutaPeso || []).length) > 0
const ciudadesTexto = (inv) => inv.ciudadNombre
  || (inv.resumenCiudades || []).map((c) => nombreCiudadDe(inv, c.ubicacion)).filter(Boolean).join(', ')
  || nombreCiudadDe(inv, inv.ciudad) || '—'

export default function Facturas() {
  const { t } = useLang()
  const navigate = useNavigate()
  const {
    invoices, invoicesRango, facturaRangoFull, numSemanas, claims, drivers, managers, ajustesPorChofer,
    selectedCity, selectedCities, ciudadesEmpresa, selectedInvoiceId, activeCompanyId,
    reloadInvoices, reloadClaims, setSelectedInvoiceId, setRango, cargando,
  } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  // El monto/ganancia solo lo ven owner/admin/súper-admin (igual que en el filtro global).
  const verMonto = esSuperAdmin || perfil?.role === 'owner' || perfil?.role === 'admin'

  // ── Lista según el filtro GLOBAL (período + ciudad) ───────────────────────
  const norm = (s) => String(s || '').trim().toLowerCase()
  const nombreDeCode = (code) => (ciudadesEmpresa || []).find((c) => c.codigo === code)?.nombre || code
  const filtroCiudades = (selectedCities && selectedCities.length)
    ? selectedCities
    : (selectedCity && selectedCity !== TODAS ? [selectedCity] : null)
  const selKeys = new Set((filtroCiudades || []).flatMap((code) => [norm(code), norm(nombreDeCode(code))]).filter(Boolean))
  const filtroKey = [...selKeys].sort().join('|')
  const clavesFactura = (inv) => {
    const ks = []
    if (inv.ciudad) ks.push(norm(inv.ciudad), norm(nombreDeCode(inv.ciudad)))
    if (inv.ciudadNombre) ks.push(norm(inv.ciudadNombre))
    if (!inv.ciudad && !inv.ciudadNombre) {
      (inv.resumenCiudades || []).forEach((c) => {
        if (c.ubicacion) ks.push(norm(c.ubicacion), norm(nombreDeCode(c.ubicacion)))
        if (c.nombreCiudad) ks.push(norm(c.nombreCiudad))
      })
    }
    return ks.filter(Boolean)
  }
  const listaBase = useMemo(
    () => (invoicesRango || []).filter((inv) => {
      if (!filtroCiudades) return true
      return clavesFactura(inv).some((k) => selKeys.has(k))
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoicesRango, filtroKey]
  )
  const filtrando = !!filtroCiudades || (invoices || []).length !== listaBase.length

  // ── Claims válidos por factura (para badges y KPI) ────────────────────────
  const claimsPorInv = useMemo(() => {
    const g = {}
    for (const c of claims || []) { const k = c.invoiceId || `s:${c.semana}`; (g[k] = g[k] || []).push(c) }
    const m = {}
    for (const inv of listaBase) m[inv.id] = contarClaimsValidos(g[inv.id] || g[`s:${inv.semana}`] || [])
    return m
  }, [claims, listaBase])

  // ── Duplicados (misma ciudad + semana) ────────────────────────────────────
  const duplicados = useMemo(() => {
    const grupos = {}
    for (const inv of invoices) {
      const ciu = inv.ciudad || (inv.resumenCiudades || [])[0]?.ubicacion || ''
      const k = `${ciu}||${inv.semana || ''}`
      ;(grupos[k] = grupos[k] || []).push(inv)
    }
    return Object.values(grupos).filter((g) => g.length > 1)
  }, [invoices])
  const idsDuplicados = useMemo(() => {
    const s = new Set()
    duplicados.forEach((g) => g.forEach((inv) => s.add(inv.id)))
    return s
  }, [duplicados])

  // ── KPIs agregados (mismas fórmulas del módulo Financiero) ────────────────
  const kpis = useMemo(() => {
    const ingreso = listaBase.reduce((a, i) => a + (Number(i.ingresoTotal) || 0), 0)
    const paquetes = listaBase.reduce((a, i) => a + (Number(i.totalPaquetes) || 0), 0)
    const descGofo = Math.abs(listaBase.reduce((a, i) => a + (Number(i.totalDescuentoGofo) || 0), 0))
    const claimsVal = Object.values(claimsPorInv).reduce((a, n) => a + (n || 0), 0)
    const g = gananciaRealDe(facturaRangoFull, claims, drivers, managers, selectedCity, numSemanas, ajustesPorChofer)
    return { ingreso, paquetes, descGofo, claimsVal, ganancia: g.gananciaReal, pagoChoferes: g.costoChoferes, margen: g.margen }
  }, [listaBase, claimsPorInv, facturaRangoFull, claims, drivers, managers, selectedCity, numSemanas, ajustesPorChofer])

  // ── Búsqueda + orden + filtros rápidos (locales) ──────────────────────────
  const [q, setQ] = useState('')
  const [orden, setOrden] = useState('reciente')
  const [chip, setChip] = useState('todas')
  const hayFiltroLocal = q.trim() || chip !== 'todas' || orden !== 'reciente'
  const limpiarLocal = () => { setQ(''); setChip('todas'); setOrden('reciente') }

  const listaMostrada = useMemo(() => {
    let arr = listaBase
    const term = norm(q)
    if (term) {
      arr = arr.filter((inv) => [ciudadesTexto(inv), inv.semana, inv.archivoNombre, String(inv.ingresoTotal || '')]
        .some((v) => norm(v).includes(term)))
    }
    if (chip === 'claims') arr = arr.filter((inv) => (claimsPorInv[inv.id] || 0) > 0)
    else if (chip === 'peso') arr = arr.filter((inv) => tieneDesglose(inv))
    else if (chip === 'sinpeso') arr = arr.filter((inv) => !tieneDesglose(inv))
    else if (chip === 'duplicadas') arr = arr.filter((inv) => idsDuplicados.has(inv.id))
    else if (chip === 'ruta') arr = arr.filter((inv) => inv.modoConfig === 'ruta')
    const ms = (ts) => { try { return ts?.toMillis ? ts.toMillis() : (ts?.toDate ? ts.toDate().getTime() : (ts ? new Date(ts).getTime() : 0)) } catch { return 0 } }
    const cp = [...arr]
    if (orden === 'reciente') cp.sort((a, b) => ms(b.fechaCarga) - ms(a.fechaCarga))
    else if (orden === 'monto') cp.sort((a, b) => (Number(b.ingresoTotal) || 0) - (Number(a.ingresoTotal) || 0))
    else if (orden === 'ciudad') cp.sort((a, b) => ciudadesTexto(a).localeCompare(ciudadesTexto(b)))
    else if (orden === 'semana') cp.sort((a, b) => String(b.semana || '').localeCompare(String(a.semana || '')))
    return cp
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listaBase, q, chip, orden, claimsPorInv, idsDuplicados])

  // ── Reprocesar (extraer precios por peso) ─────────────────────────────────
  const [reproId, setReproId] = useState(null)
  const [objetivo, setObjetivo] = useState(null)
  const [reproMsg, setReproMsg] = useState(null)
  const fileRef = useRef(null)
  const pedirArchivo = (inv) => { setObjetivo(inv); setReproMsg(null); fileRef.current?.click() }
  const onArchivos = async (e) => {
    const files = [...(e.target.files || [])]
    e.target.value = ''
    const inv = objetivo
    if (!files.length || !inv) return
    setReproId(inv.id)
    try {
      const procs = []
      for (const f of files) procs.push(procesarArchivo(await f.arrayBuffer(), f.name, inv.modoConfig || 'estandar'))
      const comb = combinarArchivos(procs)
      const rp = comb.simuladorDesglose || comb.resumenRutaPeso || []
      if (!rp.length) { setReproMsg({ tipo: 'error', txt: t('El archivo no trae desglose por peso (o no es una factura válida de Gofo).') }); return }
      const ref = Number(inv.ingresoTotal) || 0
      const difPct = ref ? Math.abs(comb.ingresoTotal - ref) / ref : 0
      if (difPct > 0.02) {
        setReproMsg({ tipo: 'warn', txt: `El total del archivo (${money(comb.ingresoTotal)}) no coincide con esta factura (${money(ref)}). Parece ser otro Excel — NO se guardó nada.` })
        return
      }
      await updateDoc(doc(db, 'invoices', inv.id), { simuladorDesglose: rp })
      await reloadInvoices()
      setReproMsg({ tipo: 'ok', txt: `Precios por peso extraídos para ${inv.ciudadNombre || inv.ciudad || ''} · ${inv.semana}. (El total no cambió: ${money(ref)}.)` })
    } catch (err) {
      setReproMsg({ tipo: 'error', txt: 'No se pudo procesar el archivo: ' + err.message })
    } finally {
      setReproId(null); setObjetivo(null)
    }
  }

  // ── Eliminar (cascada) ────────────────────────────────────────────────────
  const [porEliminar, setPorEliminar] = useState(null)
  const [eliminando, setEliminando] = useState(false)
  const [progreso, setProgreso] = useState(null)
  const [error, setError] = useState('')
  const eliminar = async () => {
    if (!porEliminar) return
    setEliminando(true); setProgreso({ hechos: 0, total: 0 }); setError('')
    try {
      await eliminarFacturaCascada(activeCompanyId, porEliminar.id, (hechos, total) => setProgreso({ hechos, total }))
      registrarAuditoria(activeCompanyId, {
        accion: 'factura_borrada', usuario: perfil?.email || perfil?.nombre || 'usuario',
        rol: perfil?.role || (esSuperAdmin ? 'superadmin' : ''), entidad: porEliminar.ciudadNombre || porEliminar.ciudad || '',
        detalle: `Factura ${porEliminar.ciudadNombre || porEliminar.ciudad || ''} borrada`,
        ciudad: porEliminar.ciudad || '', semana: porEliminar.semana || '', monto: Number(porEliminar.ingresoTotal) || 0,
      })
      const eraSeleccionada = selectedInvoiceId === porEliminar.id
      const restantes = await reloadInvoices()
      if (eraSeleccionada) setSelectedInvoiceId(restantes && restantes[0] ? restantes[0].id : null)
      await reloadClaims()
      if (detalle?.id === porEliminar.id) setDetalle(null)
      setPorEliminar(null)
    } catch (e) {
      setError('Error al eliminar: ' + e.message)
    } finally {
      setEliminando(false); setProgreso(null)
    }
  }

  const [detalle, setDetalle] = useState(null)
  // Abre otra sección (Financiero/Pagos/Claims/Rutas) apuntando a ESTA factura.
  const abrirEn = (inv, path) => {
    setSelectedInvoiceId(inv.id)
    setRango({ preset: 'factura', invoiceIds: [inv.id], invoiceId: inv.id, desde: '', hasta: '' })
    navigate(path)
  }

  const exportar = () => {
    exportarExcel(`facturas_${Date.now()}`, [{
      nombre: 'Facturas',
      rows: listaMostrada.map((inv) => ({
        Semana: inv.semana, Ciudad: ciudadesTexto(inv), Cargada: fFecha(inv.fechaCarga),
        Archivo: inv.archivoNombre, Paquetes: Number(inv.totalPaquetes) || 0,
        Claims: claimsPorInv[inv.id] || 0, ...(verMonto ? { Total: Number(inv.ingresoTotal) || 0 } : {}),
        Modo: inv.modoConfig === 'ruta' ? 'Por ruta' : 'Estándar',
      })),
    }])
  }

  if (cargando) return <Cargando texto={t('Cargando facturas…')} />

  const CHIPS = [
    { k: 'todas', l: t('Todas'), n: listaBase.length },
    { k: 'claims', l: t('Con claims'), n: listaBase.filter((i) => (claimsPorInv[i.id] || 0) > 0).length },
    { k: 'peso', l: t('Con desglose de peso'), n: listaBase.filter(tieneDesglose).length },
    { k: 'sinpeso', l: t('Sin desglose'), n: listaBase.filter((i) => !tieneDesglose(i)).length },
    { k: 'ruta', l: t('Por ruta'), n: listaBase.filter((i) => i.modoConfig === 'ruta').length },
    { k: 'duplicadas', l: t('Duplicadas'), n: [...idsDuplicados].filter((id) => listaBase.some((i) => i.id === id)).length },
  ].filter((c) => c.k === 'todas' || c.n > 0)

  return (
    <div>
      <input ref={fileRef} type="file" accept=".xlsx,.xls" multiple onChange={onArchivos} className="hidden" />

      {/* Encabezado */}
      <PageTitle right={
        <div className="flex items-center gap-2">
          <Boton variant="ghost" onClick={exportar} disabled={!listaMostrada.length} className="px-3 py-2 text-xs"><Download size={15} strokeWidth={1.9} /> {t('Exportar')}</Boton>
          <Boton variant="gold" onClick={() => navigate('/facturas')} className="px-4 py-2"><Upload size={16} strokeWidth={2} /> {t('Cargar factura')}</Boton>
        </div>
      }>{t('Facturas')}</PageTitle>
      <p className="-mt-3 mb-5 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        {t('Todas tus facturas de flete en un solo lugar: ingresos, ganancia real, claims y desglose por ciudad. Usa el filtro de arriba para acotar por período o ciudad.')}
      </p>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {reproMsg && <Aviso tipo={reproMsg.tipo}>{reproMsg.txt}</Aviso>}

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {verMonto && <KPI label={t('Total facturado')} value={money(kpis.ingreso)} icon={DollarSign} accent="green" sub={`${num(listaBase.length)} ${t('facturas')}`} />}
        {verMonto && <KPI label={t('Ganancia real')} value={money(kpis.ganancia)} icon={TrendingUp} accent="gold" sub={`${t('Margen')} ${pct(kpis.margen || 0)}`} onClick={() => navigate('/financiero')} />}
        {verMonto && <KPI label={t('Pago a choferes')} value={money(kpis.pagoChoferes)} icon={Truck} accent="blue" onClick={() => navigate('/pagos')} />}
        <KPI label={t('Claims válidos')} value={num(kpis.claimsVal)} icon={AlertTriangle} accent="red" sub={verMonto ? `${money(kpis.descGofo)} ${t('descontado')}` : undefined} onClick={() => navigate('/claims')} />
        <KPI label={t('Paquetes')} value={num(kpis.paquetes)} icon={Package} accent="navy" />
        <KPI label={t('Facturas')} value={num(listaBase.length)} icon={Receipt} accent="slate" sub={filtrando ? `${t('de')} ${num(invoices.length)}` : t('en el período')} />
      </div>

      {/* Aviso de duplicados */}
      {duplicados.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/40 dark:bg-amber-500/10">
          <div className="flex items-start gap-2">
            <AlertTriangle size={18} strokeWidth={1.9} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <b>{t('Posibles facturas duplicadas')}</b> ({t('misma ciudad y semana')}). {t('Esto pasa al re-subir una factura sin borrar la anterior. Deja una sola por semana y borra las demás.')}
              <button onClick={() => setChip('duplicadas')} className="ml-1 font-semibold underline">{t('Ver duplicadas')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de herramientas */}
      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={t('Buscar por ciudad, semana, archivo o monto…')}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-800 outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/30 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
              />
              {q && <button onClick={() => setQ('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={15} /></button>}
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <ArrowUpDown size={14} className="text-slate-400" />
                <select value={orden} onChange={(e) => setOrden(e.target.value)} className="bg-transparent text-sm outline-none">
                  <option value="reciente">{t('Más recientes')}</option>
                  <option value="monto">{t('Mayor monto')}</option>
                  <option value="ciudad">{t('Ciudad (A-Z)')}</option>
                  <option value="semana">{t('Semana')}</option>
                </select>
              </label>
              {hayFiltroLocal && (
                <button onClick={limpiarLocal} className="inline-flex items-center gap-1 rounded-lg px-2 py-2 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-brand-navy dark:text-slate-400 dark:hover:bg-slate-700/50">
                  <X size={13} /> {t('Limpiar')}
                </button>
              )}
            </div>
          </div>
          <div className="scroll-thin flex items-center gap-1.5 overflow-x-auto">
            <Filter size={14} className="flex-shrink-0 text-slate-400" />
            {CHIPS.map((c) => (
              <button
                key={c.k}
                onClick={() => setChip(c.k)}
                className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${chip === c.k ? 'bg-brand-navy text-white dark:bg-brand-gold dark:text-brand-navy' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:hover:bg-slate-700'}`}
              >
                {c.l}<span className={`rounded-full px-1.5 text-[10px] ${chip === c.k ? 'bg-white/20' : 'bg-slate-200/80 dark:bg-slate-600/60'}`}>{c.n}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Listado (tarjetas modernas, no tabla Excel) */}
      {listaMostrada.length === 0 ? (
        listaBase.length === 0 ? (
          <EstadoVacio
            titulo={t('Empieza a gestionar tus facturas')}
            texto={t('Aún no hay facturas en este período. Sube tu primer archivo de Gofo para ver ingresos, ganancia y claims aquí.')}
          />
        ) : (
          <Card className="px-6 py-12 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-slate-800"><Search size={22} /></div>
            <h3 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">{t('Sin resultados')}</h3>
            <p className="mx-auto mb-4 max-w-sm text-sm text-slate-500 dark:text-slate-400">{t('Ninguna factura coincide con tu búsqueda o filtros.')}</p>
            <Boton variant="ghost" onClick={limpiarLocal}>{t('Limpiar filtros')}</Boton>
          </Card>
        )
      ) : (
        <div className="space-y-2.5">
          {listaMostrada.map((inv) => {
            const ciudad = ciudadesTexto(inv)
            const nClaims = claimsPorInv[inv.id] || 0
            const dup = idsDuplicados.has(inv.id)
            return (
              <Card
                key={inv.id}
                onClick={() => setDetalle(inv)}
                className="group cursor-pointer p-3.5 transition-all duration-150 hover:-translate-y-0.5 hover:border-brand-gold/60 hover:shadow-cardhover sm:p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  {/* Avatar ciudad */}
                  <div className={`grid h-11 w-11 flex-shrink-0 place-items-center rounded-2xl text-sm font-black text-white ${colorDe(ciudad)}`}>{inicialesDe(ciudad)}</div>
                  {/* Título + meta */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-[15px] font-bold text-brand-navy dark:text-slate-100">{ciudad}</span>
                      {inv.modoConfig === 'ruta' && <Badge color="blue">{t('Por ruta')}</Badge>}
                      {dup && <Badge color="gold">{t('Duplicada')}</Badge>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {semanaLabel(inv.semana)}</span>
                      <span className="inline-flex items-center gap-1"><Package size={12} /> {num(inv.totalPaquetes || 0)} {t('paq.')}</span>
                      <span className="inline-flex items-center gap-1"><Truck size={12} /> {num(inv.numChoferes || 0)}</span>
                    </div>
                  </div>
                  {/* Estados/badges */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    {nClaims > 0
                      ? <Badge color="red">{nClaims} {t('claims')}</Badge>
                      : <Badge color="green"><span className="inline-flex items-center gap-1"><CheckCircle2 size={11} /> {t('Sin claims')}</span></Badge>}
                    {tieneDesglose(inv)
                      ? <Badge color="slate"><span className="inline-flex items-center gap-1"><Scale size={11} /> {t('Peso ✓')}</span></Badge>
                      : <Badge color="gold">{t('Sin peso')}</Badge>}
                  </div>
                  {/* Monto + fecha */}
                  <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:justify-center">
                    {verMonto && <div className="text-right text-base font-black tabular-nums text-emerald-600 dark:text-emerald-400">{money(inv.ingresoTotal)}</div>}
                    <div className="text-[11px] text-slate-400">{t('Cargada')} {fFecha(inv.fechaCarga)}</div>
                  </div>
                  {/* Acciones rápidas */}
                  <div className="flex items-center gap-1.5 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                    {!tieneDesglose(inv) && (
                      <button onClick={() => pedirArchivo(inv)} disabled={reproId === inv.id} title={t('Extraer precios por peso')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-700">
                        {reproId === inv.id ? <Spinner /> : <Scale size={15} />}
                      </button>
                    )}
                    <button onClick={() => setDetalle(inv)} title={t('Ver detalle')} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-700"><ExternalLink size={15} /></button>
                    <button onClick={() => setPorEliminar(inv)} title={t('Eliminar')} className="grid h-8 w-8 place-items-center rounded-lg text-rose-400 transition hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"><Trash2 size={15} /></button>
                  </div>
                </div>
              </Card>
            )
          })}
          <div className="pt-1 text-center text-xs text-slate-400">
            {t('Mostrando')} {num(listaMostrada.length)} {t('de')} {num(listaBase.length)} {t('facturas')}
            {filtrando && ` · ${t('según el filtro de arriba')}`}
          </div>
        </div>
      )}

      {/* Drawer de detalle */}
      {detalle && (
        <PanelDetalle
          inv={detalle} onClose={() => setDetalle(null)} verMonto={verMonto} t={t}
          claims={claims} drivers={drivers} managers={managers} ajustesPorChofer={ajustesPorChofer}
          nClaims={claimsPorInv[detalle.id] || 0}
          onExtraerPeso={() => pedirArchivo(detalle)} reproId={reproId}
          onEliminar={() => setPorEliminar(detalle)} abrirEn={abrirEn}
        />
      )}

      {/* Confirmar eliminación */}
      {porEliminar && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => !eliminando && setPorEliminar(null)}>
          <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400"><AlertTriangle size={18} /></span>
              <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">{t('Eliminar factura')}</h3>
            </div>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              {t('¿Seguro que quieres eliminar la factura de')} <b>{ciudadesTexto(porEliminar)}</b> — <b>{porEliminar.semana}</b>? {t('Se borrarán también sus claims y pagos asociados. Esta acción no se puede deshacer.')}
            </p>
            {eliminando && progreso && (
              <div className="mb-3">
                <div className="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>{t('Eliminando…')}</span><span>{progreso.hechos} {t('de')} {progreso.total || '—'}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-brand-gold transition-all duration-200" style={{ width: `${progreso.total ? Math.round((progreso.hechos / progreso.total) * 100) : 5}%` }} />
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setPorEliminar(null)} disabled={eliminando}>{t('Cancelar')}</Boton>
              <Boton variant="danger" onClick={eliminar} disabled={eliminando}>{eliminando ? <><Spinner /> {t('Eliminando…')}</> : t('Sí, eliminar')}</Boton>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

// ── Fila de dato del resumen financiero ─────────────────────────────────────
function Dato({ label, value, icon: Icon, accent = 'slate', fuerte }) {
  const col = {
    green: 'text-emerald-600 dark:text-emerald-400', gold: 'text-brand-gold', red: 'text-rose-600 dark:text-rose-400',
    blue: 'text-brand-steel dark:text-brand-steel-soft', navy: 'text-brand-navy dark:text-slate-100', slate: 'text-slate-700 dark:text-slate-200',
  }[accent]
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700/60 dark:bg-slate-800/40">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-400">
        {Icon && <Icon size={12} />}{label}
      </div>
      <div className={`mt-1 tabular-nums ${fuerte ? 'text-lg font-black' : 'text-base font-bold'} ${col}`}>{value}</div>
    </div>
  )
}

// ── Drawer de detalle de una factura ────────────────────────────────────────
function PanelDetalle({ inv, onClose, verMonto, t, claims, drivers, managers, ajustesPorChofer, nClaims, onExtraerPeso, reproId, onEliminar, abrirEn }) {
  const ciudad = ciudadesTexto(inv)
  const claimsInv = useMemo(
    () => (claims || []).filter((c) => c.invoiceId === inv.id || (!c.invoiceId && c.semana === inv.semana)),
    [claims, inv]
  )
  const g = useMemo(
    () => gananciaRealDe(inv, claimsInv, drivers, managers, TODAS, 1, ajustesPorChofer),
    [inv, claimsInv, drivers, managers, ajustesPorChofer]
  )
  const ciudades = porCiudad(inv.resumenCiudades || [], TODAS)
  const topChoferes = [...(inv.resumenChoferes || [])].sort((a, b) => (b.ingreso || 0) - (a.ingreso || 0)).slice(0, 6)

  const accion = (icon, label, onClick, danger) => {
    const Icon = icon
    return (
      <button onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${danger ? 'border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-500/30 dark:hover:bg-rose-500/10' : 'border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-brand-navy dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700/50'}`}>
        <Icon size={13} /> {label}
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex justify-end bg-black/50" onClick={onClose}>
      <div className="animate-slide-up flex h-full w-full max-w-xl flex-col overflow-hidden bg-slate-50 shadow-2xl dark:bg-slate-950" onClick={(e) => e.stopPropagation()}>
        {/* Cabecera */}
        <div className="flex items-start gap-3 border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className={`grid h-12 w-12 flex-shrink-0 place-items-center rounded-2xl text-base font-black text-white ${colorDe(ciudad)}`}>{inicialesDe(ciudad)}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 truncate text-lg font-black text-brand-navy dark:text-slate-100">{ciudad}</h2>
              {inv.modoConfig === 'ruta' && <Badge color="blue">{t('Por ruta')}</Badge>}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1"><CalendarDays size={12} /> {semanaLabel(inv.semana)}</span>
              <span className="inline-flex items-center gap-1"><FileText size={12} /> {t('Cargada')} {fFecha(inv.fechaCarga)}</span>
            </div>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>

        {/* Cuerpo */}
        <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
          {/* Resumen financiero */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Resumen financiero')}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {verMonto && <Dato label={t('Ingreso total')} value={money(inv.ingresoTotal)} icon={DollarSign} accent="green" fuerte />}
              {verMonto && <Dato label={t('Ganancia real')} value={money(g.gananciaReal)} icon={TrendingUp} accent="gold" fuerte />}
              {verMonto && <Dato label={t('Margen')} value={pct(g.margen || 0)} icon={Percent} accent="navy" />}
              {verMonto && <Dato label={t('Pago a choferes')} value={money(g.costoChoferes)} icon={Truck} accent="blue" />}
              {verMonto && <Dato label={t('Gastos fijos')} value={money(g.costoManagers)} icon={Users} accent="slate" />}
              {verMonto && <Dato label={t('Ingreso neto')} value={money(g.ingresoNeto)} icon={Receipt} accent="navy" />}
            </div>
          </div>

          {/* Operación */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Operación')}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Dato label={t('Paquetes')} value={num(inv.totalPaquetes || 0)} icon={Package} accent="navy" />
              <Dato label={t('Individuales')} value={num(inv.totalIndividuales || 0)} icon={Layers} accent="blue" />
              <Dato label={t('Dobles')} value={num(inv.totalDobles || 0)} icon={Layers} accent="gold" />
              <Dato label={t('Choferes')} value={num(inv.numChoferes || 0)} icon={Truck} accent="slate" />
              <Dato label={t('Rutas')} value={num(inv.numRutas || 0)} icon={RouteIcon} accent="slate" />
              <Dato label={t('Claims válidos')} value={num(nClaims)} icon={AlertTriangle} accent="red" />
            </div>
            {(inv.totalFallidos > 0) && (
              <div className="mt-2 text-xs text-slate-400">{num(inv.totalFallidos)} {t('“Failed delivery” (solo informativo)')}</div>
            )}
          </div>

          {/* Desglose por ciudad */}
          {ciudades.length > 1 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Por ciudad')}</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700/60">
                {ciudades.map((c, i) => (
                  <div key={c.ubicacion || i} className={`flex items-center justify-between gap-2 px-3 py-2 text-sm ${i % 2 ? 'bg-white dark:bg-slate-800/40' : 'bg-slate-50 dark:bg-slate-800/20'}`}>
                    <span className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-200"><MapPin size={13} className="text-amber-500" /> {c.nombreCiudad || nombreCiudadDe(inv, c.ubicacion)}</span>
                    <span className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>{num(c.paquetes || 0)} {t('paq.')}</span>
                      {verMonto && <span className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{money(c.ingreso)}</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top choferes */}
          {topChoferes.length > 0 && (
            <div>
              <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Choferes destacados')}</h3>
              <div className="space-y-1.5">
                {topChoferes.map((c, i) => (
                  <div key={c.nombre || i} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-700/60 dark:bg-slate-800/40">
                    <div className={`grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[11px] font-bold text-white ${colorDe(c.nombre)}`}>{inicialesDe(c.nombre)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">{c.nombre}</div>
                      <div className="text-[11px] text-slate-400">{num(c.individuales || 0)} ind · {num(c.dobles || 0)} dob{c.numClaims ? ` · ${c.numClaims} claims` : ''}</div>
                    </div>
                    {verMonto && <div className="text-sm font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{money(c.ingreso)}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ver en otras secciones */}
          <div>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">{t('Ver esta factura en')}</h3>
            <div className="flex flex-wrap gap-2">
              {verMonto && accion(DollarSign, t('Financiero'), () => abrirEn(inv, '/financiero'))}
              {verMonto && accion(Truck, t('Pagos'), () => abrirEn(inv, '/pagos'))}
              {accion(AlertTriangle, t('Claims'), () => abrirEn(inv, '/claims'))}
              {accion(RouteIcon, t('Rutas'), () => abrirEn(inv, '/rutas'))}
            </div>
          </div>

          {/* Metadatos */}
          <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-500 dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-400">
            <div className="flex items-start gap-1.5"><FileText size={13} className="mt-0.5 flex-shrink-0" /> <span className="break-all">{inv.archivoNombre || '—'}</span></div>
            <div className="mt-1">{t('Modo')}: {inv.modoConfig === 'ruta' ? t('Por ruta') : t('Estándar')}</div>
          </div>
        </div>

        {/* Pie con acciones */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          {!tieneDesglose(inv) && accion(reproId === inv.id ? Spinner : Scale, t('Extraer peso'), onExtraerPeso)}
          <div className="ml-auto">{accion(Trash2, t('Eliminar'), onEliminar, true)}</div>
        </div>
      </div>
    </div>
  )
}
