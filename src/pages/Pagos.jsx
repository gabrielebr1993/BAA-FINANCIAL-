import { useState, useEffect, useMemo, useCallback } from 'react'
import { collection, getDocs, query, where, addDoc, updateDoc, setDoc, doc, serverTimestamp } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { calcularPagos, porCiudad, claimsDeCiudad, feeDeClaim, buscarDriver, TODAS } from '../utils/calc'
import { perdonarClaim, quitarPerdon } from '../utils/claims'
import { stripePagar } from '../utils/stripe'
import { exportarPDF } from '../utils/exportar'
import { money, num } from '../utils/format'
import { PLANTILLA_PAGO_DEFAULT, llenarPlantilla, nombreEmpresa, enviosChofer } from '../utils/mensajes'
import { DollarSign, Receipt, TrendingUp, Clock, FileSpreadsheet, FileText, X, Eye, EyeOff, CreditCard, MessageSquare, MessageCircle, Mail, Wallet, Landmark } from 'lucide-react'
import { nombreCiudad } from '../constants'
import { Card, KPI, PageTitle, Boton, Badge, Input, Select, Aviso, Cargando, EstadoVacio, Spinner } from '../components/ui'

const TD = 'px-2.5 py-2.5 whitespace-nowrap'

export default function Pagos() {
  const { perfil, esSuperAdmin, ciudadBloqueada, ciudadUsuario } = useAuth()
  const { facturaRango: selectedInvoice, invoicesRango, claims, drivers, managers, reloadManagers, selectedCity, activeCompanyId, reloadClaims, reloadInvoices, ajustesPorChofer, cargando, ajustes, empresaActiva } = useData()
  const puedePagar = esSuperAdmin || perfil?.role === 'owner'
  // SOLO dueño/súper-admin ven lo relacionado con GANANCIA (ingreso de Gofo,
  // ganancia total y por chofer). Un manager con acceso a Pagos solo ve lo
  // necesario para PAGAR: entregas, tarifas, descuento por claims y total a pagar.
  const verGanancia = puedePagar
  const [payrollMap, setPayrollMap] = useState({})
  const [pagandoStripe, setPagandoStripe] = useState(null) // nombre del chofer en proceso
  const [stripeMsg, setStripeMsg] = useState(null)
  const [fEstado, setFEstado] = useState('')
  const [busqueda, setBusqueda] = useState('') // por nombre o rate
  const [expandido, setExpandido] = useState(null)
  const [perdonandoId, setPerdonandoId] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)
  // Ojitos de privacidad: ocultan un dato sensible en TODA la página (KPI +
  // columna + total). Solo afecta lo que se VE en pantalla; las exportaciones
  // siguen completas.
  const [ocultarIngreso, setOcultarIngreso] = useState(false)
  const [ocultarGanancia, setOcultarGanancia] = useState(false)
  const OCULTO = '••••••'
  const fIngreso = (v) => (ocultarIngreso ? OCULTO : money(v))
  const fGanancia = (v) => (ocultarGanancia ? OCULTO : money(v))
  // El ojito oculta también el RÓTULO (la palabra), no solo el número.
  const lIngreso = (t) => (ocultarIngreso ? OCULTO : t)
  const lGanancia = (t) => (ocultarGanancia ? OCULTO : t)

  // Los pagos se marcan por factura individual: solo con una semana seleccionada.
  const pagoInvoiceId = invoicesRango.length === 1 ? invoicesRango[0].id : null
  const esRango = invoicesRango.length > 1

  const cargarPayroll = useCallback(async () => {
    if (!pagoInvoiceId || !activeCompanyId) return setPayrollMap({})
    const snap = await getDocs(query(collection(db, 'payroll'), where('companyId', '==', activeCompanyId), where('invoiceId', '==', pagoInvoiceId)))
    const map = {}
    snap.docs.forEach((d) => {
      map[d.data().driverNombre] = { id: d.id, ...d.data() }
    })
    setPayrollMap(map)
  }, [pagoInvoiceId, activeCompanyId])

  useEffect(() => {
    cargarPayroll()
  }, [cargarPayroll])

  // Ajustes manuales (préstamo/bono) por chofer, guardados EN la factura de la semana.
  const invActual = invoicesRango.length === 1 ? invoicesRango[0] : null
  const [editAjuste, setEditAjuste] = useState({}) // nombre -> { prestamo, bono }
  const [guardandoAjuste, setGuardandoAjuste] = useState(null)
  const driverKey = (n) => (n || '').trim().toLowerCase()
  const guardarAjuste = async (nombre) => {
    if (!invActual) return
    const k = driverKey(nombre)
    const e = editAjuste[nombre] || {}
    const prestamo = Number(e.prestamo) || 0
    const bono = Number(e.bono) || 0
    setGuardandoAjuste(nombre)
    try {
      const nuevo = { ...(invActual.ajustesPago || {}) }
      if (!prestamo && !bono) delete nuevo[k]
      else nuevo[k] = { prestamo, bono }
      await updateDoc(doc(db, 'invoices', invActual.id), { ajustesPago: nuevo })
      // Espejo en driverStats para que el chofer lo vea en su portal (él no puede
      // leer las facturas, pero sí su propia fila de driverStats).
      const skey = k.replace(/[^a-z0-9]+/g, '_').slice(0, 80)
      await setDoc(doc(db, 'driverStats', `${invActual.id}__${skey}`), { prestamo, bono }, { merge: true }).catch(() => {})
      await reloadInvoices()
      setEditAjuste((s) => { const n = { ...s }; delete n[nombre]; return n })
    } finally { setGuardandoAjuste(null) }
  }

  const pagos = useMemo(() => calcularPagos(selectedInvoice, claims, drivers, selectedCity, ajustesPorChofer), [selectedInvoice, claims, drivers, selectedCity, ajustesPorChofer])
  // Modo POR RUTA: mostramos la ruta de cada chofer (de la factura, o su ruta guardada).
  const esRuta = selectedInvoice?.modoConfig === 'ruta'
  const rutaDe = (nombre) => selectedInvoice?.asignacionRuta?.[nombre] || buscarDriver(drivers, nombre)?.rutaDefault || '—'
  const pagosConEstado = pagos.map((p) => ({ ...p, estado: payrollMap[p.nombre]?.estado || 'pendiente', ruta: esRuta ? rutaDe(p.nombre) : null }))
  const filtrados = pagosConEstado.filter((p) => {
    if (fEstado === 'pendiente' && p.estado !== 'pendiente') return false
    if (fEstado === 'pagado' && p.estado !== 'pagado') return false
    const q = busqueda.trim().toLowerCase()
    if (q) {
      const nombre = (p.nombre || '').toLowerCase()
      const ind = String(p.tarifaInd ?? '')
      const dob = String(p.tarifaDoble ?? '')
      if (!(nombre.includes(q) || ind.includes(q) || dob.includes(q))) return false
    }
    return true
  })

  const totIngreso = filtrados.reduce((a, p) => a + p.ingreso, 0)
  const totPagar = filtrados.reduce((a, p) => a + p.totalPagar, 0)
  const totGanancia = filtrados.reduce((a, p) => a + p.ganancia, 0)
  const totPrestamo = filtrados.reduce((a, p) => a + (p.prestamo || 0), 0)
  const totBono = filtrados.reduce((a, p) => a + (p.bono || 0), 0)
  const subAjustes = [totPrestamo > 0 ? `−${money(totPrestamo)} préstamos` : '', totBono > 0 ? `+${money(totBono)} bonos` : ''].filter(Boolean).join(' · ') || undefined

  // GASTOS FIJOS del periodo (managers activos de la ciudad × semanas del rango).
  // También los pagas tú, por eso aparecen aquí para marcarlos como pagados.
  const semanas = Math.max(1, invoicesRango.length)
  const gastosFijos = useMemo(() => {
    const activos = (managers || []).filter((m) => m.activo !== false)
    const ciudadFiltro = ciudadBloqueada ? ciudadUsuario : (selectedCity && selectedCity !== TODAS ? selectedCity : null)
    const filtrados = ciudadFiltro ? activos.filter((m) => (m.ciudad || '') === ciudadFiltro) : activos
    return filtrados
      .map((m) => ({ ...m, monto: (Number(m.sueldoSemanal) || 0) * semanas, estado: (pagoInvoiceId && m.pagados && m.pagados[pagoInvoiceId] === 'pagado') ? 'pagado' : 'pendiente' }))
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
  }, [managers, selectedCity, ciudadBloqueada, ciudadUsuario, semanas, pagoInvoiceId])
  const totGastosFijos = gastosFijos.reduce((a, g) => a + g.monto, 0)
  const marcarGasto = async (m, estado) => {
    if (!pagoInvoiceId) return
    await updateDoc(doc(db, 'managers', m.id), { [`pagados.${pagoInvoiceId}`]: estado })
    await reloadManagers()
  }
  const nPend = pagosConEstado.filter((p) => p.estado === 'pendiente').length
  const nPag = pagosConEstado.filter((p) => p.estado === 'pagado').length

  const marcarEstado = async (p, estado) => {
    if (!pagoInvoiceId) return
    const existente = payrollMap[p.nombre]
    const payload = {
      companyId: activeCompanyId,
      invoiceId: pagoInvoiceId,
      semana: selectedInvoice?.semana || '',
      driverNombre: p.nombre,
      individuales: p.individuales,
      dobles: p.dobles,
      claimsCobrados: p.claimsActivos,
      totalPagar: p.totalPagar,
      estado,
      pagadoEn: estado === 'pagado' ? serverTimestamp() : null,
    }
    if (existente) await updateDoc(doc(db, 'payroll', existente.id), payload)
    else await addDoc(collection(db, 'payroll'), payload)
    await cargarPayroll()
  }

  // Pago por Stripe (SOLO modo TEST; el servidor rechaza pagos reales). Requiere que
  // el chofer esté verificado en Stripe.
  const pagarStripe = async (p, driver) => {
    if (!driver?.id) return setStripeMsg({ tipo: 'warn', txt: `${p.nombre} no está registrado como chofer guardado.` })
    if (!(p.totalPagar > 0)) return setStripeMsg({ tipo: 'warn', txt: `No hay monto a pagar para ${p.nombre}.` })
    if (!window.confirm(`Pagar ${money(p.totalPagar)} a ${p.nombre} por Stripe en modo TEST?`)) return
    setPagandoStripe(p.nombre); setStripeMsg(null)
    try {
      const r = await stripePagar({ companyId: activeCompanyId, driverId: driver.id, monto: p.totalPagar, semana: selectedInvoice?.semana || '' })
      if (!r.ok) return setStripeMsg({ tipo: 'error', txt: `${p.nombre}: ${r.error}` })
      setStripeMsg({ tipo: 'ok', txt: `Pago TEST enviado a ${p.nombre} (${money(p.totalPagar)}). Transfer: ${r.transferId}` })
    } catch (e) {
      setStripeMsg({ tipo: 'error', txt: `${p.nombre}: ${e.message}` })
    } finally { setPagandoStripe(null) }
  }

  // Mensaje de "ya te pagué" con el monto transferido (plantilla de la empresa).
  const avisoPagoDe = (p) => {
    const texto = llenarPlantilla(ajustes?.mensajePago || PLANTILLA_PAGO_DEFAULT, {
      nombre: p.nombre, monto: money(p.totalPagar), semana: selectedInvoice?.semana || '',
      empresa: nombreEmpresa(ajustes, empresaActiva), numero: ajustes?.numeroEmpresa || '',
    })
    return enviosChofer(buscarDriver(drivers, p.nombre), texto, 'Aviso de pago')
  }

  const claimsDeChofer = (nombre) => claimsDeCiudad(claims, selectedCity, selectedInvoice).filter((c) => c.courier === nombre)

  const confirmarPerdon = async (claim) => {
    setOcupado(true)
    await perdonarClaim(claim, motivo, perfil)
    await reloadClaims()
    setPerdonandoId(null)
    setMotivo('')
    setOcupado(false)
  }
  const restaurar = async (claim) => {
    setOcupado(true)
    await quitarPerdon(claim)
    await reloadClaims()
    setOcupado(false)
  }

  const exportar = () => {
    // Con el ojito tapando, la columna se OMITE por completo del archivo (no sale
    // ni el encabezado ni el valor). Sin tapar, sale normal.
    const cols = [
      { h: 'Chofer', v: (p) => p.nombre },
      ...(esRuta ? [{ h: 'Ruta', v: (p) => p.ruta || '' }] : []),
      { h: 'Ciudad', v: (p) => p.nombreCiudad },
      { h: 'Individuales', v: (p) => p.individuales },
      { h: 'Dobles', v: (p) => p.dobles },
      { h: 'Claims activos', v: (p) => p.claimsActivos },
      { h: 'Claims perdonados', v: (p) => p.claimsPerdonados },
      ...(!verGanancia || ocultarIngreso ? [] : [{ h: 'Ingreso Gofo', v: (p) => p.ingreso }]),
      { h: 'Tarifa Ind', v: (p) => p.tarifaInd },
      { h: 'Tarifa Doble', v: (p) => p.tarifaDoble },
      { h: 'Descuento Claims', v: (p) => p.descuentoClaims },
      { h: 'Total a Pagar', v: (p) => p.totalPagar },
      ...(!verGanancia || ocultarGanancia ? [] : [{ h: 'Ganancia', v: (p) => p.ganancia }]),
      { h: 'Estado', v: (p) => p.estado },
    ]
    const aoa = [cols.map((c) => c.h), ...pagosConEstado.map((p) => cols.map((c) => c.v(p)))]
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pagos')
    XLSX.writeFile(wb, `pagos_${selectedInvoice?.semana || 'factura'}.xlsx`)
  }

  const exportarPdf = () => {
    // Igual que el Excel: la columna se omite si el ojito la está tapando.
    const cols = [
      { h: 'Chofer', v: (p) => p.nombre },
      { h: 'Ciudad', v: (p) => p.nombreCiudad },
      { h: 'Ind.', v: (p) => p.individuales },
      { h: 'Dobles', v: (p) => p.dobles },
      ...(!verGanancia || ocultarIngreso ? [] : [{ h: 'Ingreso', v: (p) => money(p.ingreso) }]),
      { h: 'Total a pagar', v: (p) => money(p.totalPagar) },
      ...(!verGanancia || ocultarGanancia ? [] : [{ h: 'Ganancia', v: (p) => money(p.ganancia) }]),
      { h: 'Estado', v: (p) => p.estado },
    ]
    exportarPDF(`pagos_${selectedInvoice?.semana || 'factura'}`, 'Pagos a Choferes', selectedInvoice?.semana || '', [
      {
        titulo: 'Pagos por chofer',
        head: cols.map((c) => c.h),
        body: pagosConEstado.map((p) => cols.map((c) => c.v(p))),
      },
    ])
  }

  return (
    <div>
      <PageTitle>Pagos a Choferes</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando pagos…" />
      ) : (
        <>
          <div className="mb-2 flex flex-wrap gap-3">
            {verGanancia && <KPI label={lIngreso('Ingreso total')} value={fIngreso(totIngreso)} icon={DollarSign} accent="green" />}
            <KPI label="Total a pagar" value={money(totPagar)} icon={Receipt} accent="navy" sub={subAjustes} />
            {totGastosFijos > 0 && <KPI label="Gastos fijos" value={money(totGastosFijos)} icon={Landmark} accent="slate" sub={`+ choferes = ${money(totPagar + totGastosFijos)}`} />}
            {(totPrestamo > 0 || totBono > 0) && <KPI label="Ajustes (préstamo / bono)" value={`−${money(totPrestamo)} / +${money(totBono)}`} icon={Wallet} accent="slate" />}
            {verGanancia && <KPI label={lGanancia('Ganancia (antes de gastos fijos)')} value={fGanancia(totGanancia)} icon={TrendingUp} accent="gold" />}
            <KPI label="Pendientes / Pagados" value={`${num(nPend)} / ${num(nPag)}`} icon={Clock} accent="slate" />
          </div>
          {verGanancia ? (
            <p className="mb-5 text-xs text-slate-400">
              Esta ganancia es la de los choferes (ingreso − pago − descuento de Gofo por claims), <b>antes</b> de gastos fijos. La <b>Ganancia real</b> (que también resta los gastos fijos) está en el <b>Dashboard</b> y <b>Financiero</b>. Si filtras o buscas, este total es solo de los choferes mostrados.
            </p>
          ) : (
            <p className="mb-5 text-xs text-slate-400">Aquí registras los pagos a los choferes: marca cada uno como pagado y avísale. Total a pagar = entregas × tarifa − descuento por claims.</p>
          )}

          {!selectedInvoice ? (
            <EstadoVacio texto="Cuando cargues una factura verás aquí el pago calculado de cada chofer." />
          ) : (
            <>
              {esRango && (
                <Aviso tipo="info">
                  Estás viendo un <b>acumulado de {invoicesRango.length} semanas</b>. Los montos mostrados son la suma del periodo. Para <b>marcar pagos</b> (pendiente/pagado), selecciona una sola semana en el rango (ej. "Última semana").
                </Aviso>
              )}
              {stripeMsg && <Aviso tipo={stripeMsg.tipo}>{stripeMsg.txt}</Aviso>}
              <Card className="mb-4 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                    <option value="">Ver todos</option>
                    <option value="pendiente">Solo pendientes</option>
                    <option value="pagado">Solo pagados</option>
                  </Select>
                  <div className="flex items-center gap-1">
                    <Input className="w-56" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre o rate (ej. 1.6)…" />
                    {busqueda && <Boton variant="ghost" className="px-2 py-1 text-xs" onClick={() => setBusqueda('')}><X size={13} strokeWidth={2} /></Boton>}
                  </div>
                  {verGanancia && (
                    <div className="flex flex-wrap items-center gap-2">
                      <OjoToggle activo={!ocultarIngreso} onClick={() => setOcultarIngreso((v) => !v)} label="Ingreso Gofo" />
                      <OjoToggle activo={!ocultarGanancia} onClick={() => setOcultarGanancia((v) => !v)} label="Ganancia" />
                    </div>
                  )}
                  <div className="ml-auto flex gap-2">
                    <Boton variant="ghost" onClick={exportar}><FileSpreadsheet size={16} strokeWidth={1.8} /> Excel</Boton>
                    <Boton variant="gold" onClick={exportarPdf}><FileText size={16} strokeWidth={1.8} /> PDF</Boton>
                  </div>
                </div>
              </Card>

              <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                <table className="w-full min-w-[980px] border-collapse text-[13.5px]">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {[
                        'Chofer', ...(esRuta ? ['Ruta'] : []), 'Ind.', 'Dobles', 'Claims (act/tot)',
                        ...(verGanancia ? [lIngreso('Ingreso Gofo')] : []),
                        'T.Ind', 'T.Doble', 'Desc. Claims', 'Total a Pagar',
                        ...(verGanancia ? [lGanancia('Ganancia')] : []),
                        'Estado', '',
                      ].map((h, i) => (
                        <th key={i} className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 && (
                      <tr><td colSpan={(verGanancia ? 12 : 10) + (esRuta ? 1 : 0)} className="px-4 py-6 text-center text-slate-400">Sin choferes con este filtro.</td></tr>
                    )}
                    {filtrados.map((p) => (
                      <FilaChofer
                        key={p.nombre}
                        p={p}
                        abierto={expandido === p.nombre}
                        onToggle={() => setExpandido(expandido === p.nombre ? null : p.nombre)}
                        onMarcar={marcarEstado}
                        puedeMarcar={!esRango}
                        fIngreso={fIngreso}
                        fGanancia={fGanancia}
                        claimsChofer={expandido === p.nombre ? claimsDeChofer(p.nombre) : []}
                        perdonandoId={perdonandoId}
                        motivo={motivo}
                        setMotivo={setMotivo}
                        setPerdonandoId={setPerdonandoId}
                        confirmarPerdon={confirmarPerdon}
                        restaurar={restaurar}
                        ocupado={ocupado}
                        driver={buscarDriver(drivers, p.nombre)}
                        puedePagar={puedePagar}
                        verGanancia={verGanancia}
                        esRuta={esRuta}
                        pagandoStripe={pagandoStripe === p.nombre}
                        onPagarStripe={pagarStripe}
                        avisoPago={!esRango && p.estado === 'pagado' ? avisoPagoDe(p) : null}
                        puedeEditarAjuste={!esRango && puedePagar}
                        editAjuste={editAjuste[p.nombre]}
                        setEditAjuste={(campo, val) => setEditAjuste((s) => ({ ...s, [p.nombre]: { ...(s[p.nombre] || { prestamo: p.prestamo || '', bono: p.bono || '' }), [campo]: val } }))}
                        onGuardarAjuste={() => guardarAjuste(p.nombre)}
                        guardandoAjuste={guardandoAjuste === p.nombre}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold dark:bg-slate-800">
                      <td className="px-2.5 py-2.5">TOTAL ({filtrados.length})</td>
                      <td colSpan={3 + (esRuta ? 1 : 0)}></td>
                      {verGanancia && <td className="px-2.5 py-2.5">{fIngreso(totIngreso)}</td>}
                      <td colSpan={3}></td>
                      <td className="px-2.5 py-2.5">{money(totPagar)}</td>
                      {verGanancia && <td className="px-2.5 py-2.5 text-brand-gold">{fGanancia(totGanancia)}</td>}
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                Fórmula: individuales × tarifa individual + dobles × tarifa doble − claims activos × multa por claim (configurable por empresa/ciudad). Perdonar un claim lo excluye del descuento y recalcula al instante.
              </p>

              {/* GASTOS FIJOS del periodo: también los pagas tú. */}
              {gastosFijos.length > 0 && (
                <Card className="mt-4 p-4">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Landmark size={18} strokeWidth={1.8} className="text-brand-gold" />
                    <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Gastos fijos del periodo</h3>
                    <span className="ml-auto text-sm text-slate-500 dark:text-slate-400">Total: <b className="text-brand-navy dark:text-slate-100">{money(totGastosFijos)}</b></span>
                  </div>
                  <div className="scroll-thin overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700/60">
                    <table className="w-full min-w-[480px] border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <th className="px-3 py-2 text-left font-semibold">Gasto fijo</th>
                          <th className="px-3 py-2 text-left font-semibold">Ciudad</th>
                          <th className="px-3 py-2 text-right font-semibold">Monto ({semanas} sem.)</th>
                          <th className="px-3 py-2 text-center font-semibold">Estado</th>
                          <th className="px-3 py-2 text-right font-semibold"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {gastosFijos.map((g) => (
                          <tr key={g.id} className="border-t border-slate-100 dark:border-slate-700/50">
                            <td className="px-3 py-2 font-medium text-brand-navy dark:text-slate-100">{g.nombre}</td>
                            <td className="px-3 py-2 text-slate-500 dark:text-slate-400">{nombreCiudad(g.ciudad)}</td>
                            <td className="px-3 py-2 text-right font-bold">{money(g.monto)}</td>
                            <td className="px-3 py-2 text-center">{g.estado === 'pagado' ? <Badge color="green">Pagado</Badge> : <Badge color="gold">Pendiente</Badge>}</td>
                            <td className="px-3 py-2 text-right">
                              {esRango ? <span className="text-xs text-slate-400">—</span> : g.estado === 'pagado'
                                ? <Boton variant="ghost" onClick={() => marcarGasto(g, 'pendiente')} className="px-2 py-1 text-xs">Marcar pendiente</Boton>
                                : <Boton variant="success" onClick={() => marcarGasto(g, 'pagado')} className="px-2 py-1 text-xs">Marcar pagado</Boton>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-bold dark:bg-slate-800">
                          <td className="px-3 py-2.5" colSpan={2}>TOTAL gastos fijos</td>
                          <td className="px-3 py-2.5 text-right text-brand-gold">{money(totGastosFijos)}</td>
                          <td colSpan={2}></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Gastos fijos activos de {selectedCity === TODAS ? 'todas las ciudades' : 'esta ciudad'} × {semanas} semana(s). {esRango ? 'Para marcarlos como pagados, elige una sola semana.' : 'Márcalos como pagados igual que a los choferes.'} Se configuran en Choferes → Gastos fijos.
                  </p>
                </Card>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

// Botón-ojito para ocultar/mostrar un dato sensible en pantalla.
function OjoToggle({ activo, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={activo ? `Ocultar ${label}` : `Mostrar ${label}`}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
        activo
          ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
          : 'border-brand-gold/40 bg-brand-gold/10 text-brand-navy dark:text-brand-gold'
      }`}
    >
      {activo ? <Eye size={14} strokeWidth={1.9} /> : <EyeOff size={14} strokeWidth={1.9} />} {label}
    </button>
  )
}

function FilaChofer({ p, abierto, onToggle, onMarcar, puedeMarcar, fIngreso, fGanancia, claimsChofer, perdonandoId, motivo, setMotivo, setPerdonandoId, confirmarPerdon, restaurar, ocupado, driver, puedePagar, verGanancia, esRuta, pagandoStripe, onPagarStripe, avisoPago, puedeEditarAjuste, editAjuste, setEditAjuste, onGuardarAjuste, guardandoAjuste }) {
  const estadoStripe = driver?.stripeEstado || 'sin_registrar'
  const verificado = estadoStripe === 'verificado'
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30">
        <td className={TD}>
          <button onClick={onToggle} className="font-semibold text-brand-navy dark:text-slate-100">
            {abierto ? '▾' : '▸'} {p.nombre}
          </button>{' '}
          {p.sinTarifa && <Badge color="red">sin tarifa</Badge>}
        </td>
        {esRuta && <td className={TD}>{p.ruta ? <Badge color="gold">{p.ruta}</Badge> : '—'}</td>}
        <td className={TD}>{num(p.individuales)}</td>
        <td className={TD}>{num(p.dobles)}</td>
        <td className={TD}>{p.claimsActivos}/{p.claimsTotales}{p.claimsPerdonados > 0 ? ` (${p.claimsPerdonados} perd.)` : ''}</td>
        {verGanancia && <td className={TD}>{fIngreso(p.ingreso)}</td>}
        <td className={TD}>{money(p.tarifaInd)}</td>
        <td className={TD}>{money(p.tarifaDoble)}</td>
        <td className={`${TD} text-rose-600 dark:text-rose-400`}>{money(p.descuentoClaims)}</td>
        <td className={`${TD} font-bold`}>
          {money(p.totalPagar)}
          {(p.prestamo > 0 || p.bono > 0) && (
            <div className="text-[10px] font-medium">
              {p.prestamo > 0 && <span className="text-rose-500">−{money(p.prestamo)} préstamo </span>}
              {p.bono > 0 && <span className="text-emerald-500">+{money(p.bono)} bono</span>}
            </div>
          )}
        </td>
        {verGanancia && <td className={`${TD} ${p.ganancia >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{fGanancia(p.ganancia)}</td>}
        <td className={TD}>{p.estado === 'pagado' ? <Badge color="green">Pagado</Badge> : <Badge color="gold">Pendiente</Badge>}</td>
        <td className={TD}>
          <div className="flex items-center justify-end gap-1.5">
            {!puedeMarcar ? (
              <span className="text-xs text-slate-400">—</span>
            ) : p.estado === 'pagado' ? (
              <>
                <Boton variant="ghost" onClick={() => onMarcar(p, 'pendiente')} className="px-2 py-1 text-xs">Marcar pendiente</Boton>
                {avisoPago && (
                  <span className="inline-flex items-center gap-0.5" title={`Avisar a ${p.nombre} que se le transfirió ${money(p.totalPagar)}`}>
                    <a href={avisoPago.sms} className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-brand-navy hover:border-brand-gold dark:border-slate-700 dark:text-slate-200" title="Avisar por SMS"><MessageSquare size={13} strokeWidth={1.9} /></a>
                    <a href={avisoPago.wa} target="_blank" rel="noreferrer" className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600" title="Avisar por WhatsApp"><MessageCircle size={13} strokeWidth={2} /></a>
                    <a href={avisoPago.mail} className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 text-brand-navy hover:border-brand-gold dark:border-slate-700 dark:text-slate-200" title="Avisar por correo"><Mail size={13} strokeWidth={1.9} /></a>
                  </span>
                )}
              </>
            ) : (
              <Boton variant="success" onClick={() => onMarcar(p, 'pagado')} className="px-2 py-1 text-xs">Marcar pagado</Boton>
            )}
            {puedePagar && (
              <Boton
                variant={verificado ? 'primary' : 'ghost'}
                disabled={!verificado || pagandoStripe}
                onClick={() => onPagarStripe(p, driver)}
                className="px-2 py-1 text-xs"
                title={verificado ? 'Pagar por Stripe (modo TEST)' : 'El chofer aún no tiene su banco verificado en Stripe'}
              >
                {pagandoStripe ? <Spinner /> : <CreditCard size={13} strokeWidth={1.9} />} {verificado ? 'Pagar (Stripe)' : 'Sin banco'}
              </Boton>
            )}
          </div>
        </td>
      </tr>
      {abierto && (
        <tr className="bg-slate-50 dark:bg-slate-800/40">
          <td colSpan={(verGanancia ? 12 : 10) + (esRuta ? 1 : 0)} className="px-4 py-2.5">
            {/* Ajustes: préstamo (se descuenta) y bono (se suma) */}
            {puedeEditarAjuste && (
              <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700/60 dark:bg-slate-800/40">
                <div className="mb-2 text-sm font-semibold text-brand-navy dark:text-slate-100">Ajustes de pago de {p.nombre}</div>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Préstamo / descuento ($)</div>
                    <Input type="number" step="0.01" min="0" className="w-32" value={editAjuste?.prestamo ?? (p.prestamo || '')} onChange={(e) => setEditAjuste('prestamo', e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <div className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">Bono ($)</div>
                    <Input type="number" step="0.01" min="0" className="w-32" value={editAjuste?.bono ?? (p.bono || '')} onChange={(e) => setEditAjuste('bono', e.target.value)} placeholder="0" />
                  </div>
                  <Boton variant="gold" disabled={guardandoAjuste} onClick={onGuardarAjuste} className="px-3 py-2 text-sm">
                    {guardandoAjuste ? <Spinner /> : 'Guardar ajuste'}
                  </Boton>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Se resta el préstamo y se suma el bono al <b>Total a Pagar</b>. Se refleja en el dashboard, finanzas y el perfil del chofer.
                  </span>
                </div>
              </div>
            )}
            <div className="mb-2 font-semibold text-brand-navy dark:text-slate-100">Claims de {p.nombre} ({claimsChofer.length})</div>
            {claimsChofer.length === 0 ? (
              <div className="text-sm text-slate-400">Sin claims.</div>
            ) : (
              <table className="w-full border-collapse text-[13px]">
                <tbody>
                  {claimsChofer.map((c) => (
                    <tr key={c.id} className="border-t border-slate-200 dark:border-slate-700/50">
                      <td className="px-2 py-1.5">{c.waybill}</td>
                      <td className="px-2 py-1.5">{c.date}</td>
                      <td className="px-2 py-1.5">{c.claimType}</td>
                      <td className="px-2 py-1.5">{money(c.montoGofo)}</td>
                      <td className="px-2 py-1.5">
                        {c.perdonado ? <Badge color="green">Perdonado</Badge> : <Badge color="red">Activo (−{money(feeDeClaim(selectedInvoice, c.ciudad, c))})</Badge>}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {perdonandoId === c.id ? (
                          <span className="inline-flex gap-1.5">
                            <Input autoFocus className="w-32" placeholder="Motivo…" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
                            <Boton variant="success" disabled={ocupado} onClick={() => confirmarPerdon(c)} className="px-2 py-1 text-xs">OK</Boton>
                            <Boton variant="ghost" onClick={() => { setPerdonandoId(null); setMotivo('') }} className="px-2 py-1 text-xs"><X size={13} strokeWidth={2.2} /></Boton>
                          </span>
                        ) : c.perdonado ? (
                          <Boton variant="ghost" disabled={ocupado} onClick={() => restaurar(c)} className="px-2 py-1 text-xs">Quitar perdón</Boton>
                        ) : (
                          <Boton variant="ghost" onClick={() => { setPerdonandoId(c.id); setMotivo('') }} className="px-2 py-1 text-xs">Perdonar</Boton>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  )
}
