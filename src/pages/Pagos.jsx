import { useState, useEffect, useMemo, useCallback } from 'react'
import { collection, getDocs, query, where, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { calcularPagos, porCiudad, claimFeeDe } from '../utils/calc'
import { perdonarClaim, quitarPerdon } from '../utils/claims'
import { exportarPDF } from '../utils/exportar'
import { money, num } from '../utils/format'
import { DollarSign, Receipt, TrendingUp, Clock, FileSpreadsheet, FileText, X } from 'lucide-react'
import { Card, KPI, PageTitle, Boton, Badge, Input, Select, Aviso, Cargando, EstadoVacio } from '../components/ui'
import CitySelector from '../components/CitySelector'
import RangeSelector from '../components/RangeSelector'

const TD = 'px-2.5 py-2.5 whitespace-nowrap'

export default function Pagos() {
  const { perfil } = useAuth()
  const { facturaRango: selectedInvoice, invoicesRango, claims, drivers, selectedCity, activeCompanyId, reloadClaims, cargando } = useData()
  const [payrollMap, setPayrollMap] = useState({})
  const [fEstado, setFEstado] = useState('')
  const [expandido, setExpandido] = useState(null)
  const [perdonandoId, setPerdonandoId] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)

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

  const pagos = useMemo(() => calcularPagos(selectedInvoice, claims, drivers, selectedCity), [selectedInvoice, claims, drivers, selectedCity])
  const pagosConEstado = pagos.map((p) => ({ ...p, estado: payrollMap[p.nombre]?.estado || 'pendiente' }))
  const filtrados = pagosConEstado.filter((p) => {
    if (fEstado === 'pendiente') return p.estado === 'pendiente'
    if (fEstado === 'pagado') return p.estado === 'pagado'
    return true
  })

  const totIngreso = filtrados.reduce((a, p) => a + p.ingreso, 0)
  const totPagar = filtrados.reduce((a, p) => a + p.totalPagar, 0)
  const totGanancia = filtrados.reduce((a, p) => a + p.ganancia, 0)
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

  const claimsDeChofer = (nombre) => porCiudad(claims, selectedCity).filter((c) => c.courier === nombre)

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
    const rows = pagosConEstado.map((p) => ({
      Chofer: p.nombre,
      Ciudad: p.nombreCiudad,
      Individuales: p.individuales,
      Dobles: p.dobles,
      'Claims activos': p.claimsActivos,
      'Claims perdonados': p.claimsPerdonados,
      'Ingreso Gofo': p.ingreso,
      'Tarifa Ind': p.tarifaInd,
      'Tarifa Doble': p.tarifaDoble,
      'Descuento Claims': p.descuentoClaims,
      'Total a Pagar': p.totalPagar,
      Ganancia: p.ganancia,
      Estado: p.estado,
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Pagos')
    XLSX.writeFile(wb, `pagos_${selectedInvoice?.semana || 'factura'}.xlsx`)
  }

  const exportarPdf = () => {
    exportarPDF(`pagos_${selectedInvoice?.semana || 'factura'}`, 'Pagos a Choferes', selectedInvoice?.semana || '', [
      {
        titulo: 'Pagos por chofer',
        head: ['Chofer', 'Ciudad', 'Ind.', 'Dobles', 'Ingreso', 'Total a pagar', 'Ganancia', 'Estado'],
        body: pagosConEstado.map((p) => [p.nombre, p.nombreCiudad, p.individuales, p.dobles, money(p.ingreso), money(p.totalPagar), money(p.ganancia), p.estado]),
      },
    ])
  }

  return (
    <div>
      <PageTitle right={<><RangeSelector /><CitySelector /></>}>Pagos a Choferes</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando pagos…" />
      ) : (
        <>
          <div className="mb-5 flex flex-wrap gap-3">
            <KPI label="Ingreso total" value={money(totIngreso)} icon={DollarSign} accent="green" />
            <KPI label="Total a pagar" value={money(totPagar)} icon={Receipt} accent="navy" />
            <KPI label="Ganancia total" value={money(totGanancia)} icon={TrendingUp} accent="gold" />
            <KPI label="Pendientes / Pagados" value={`${num(nPend)} / ${num(nPag)}`} icon={Clock} accent="slate" />
          </div>

          {!selectedInvoice ? (
            <EstadoVacio texto="Cuando cargues una factura verás aquí el pago calculado de cada chofer." />
          ) : (
            <>
              {esRango && (
                <Aviso tipo="info">
                  Estás viendo un <b>acumulado de {invoicesRango.length} semanas</b>. Los montos mostrados son la suma del periodo. Para <b>marcar pagos</b> (pendiente/pagado), selecciona una sola semana en el rango (ej. "Última semana").
                </Aviso>
              )}
              <Card className="mb-4 p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <Select value={fEstado} onChange={(e) => setFEstado(e.target.value)}>
                    <option value="">Ver todos</option>
                    <option value="pendiente">Solo pendientes</option>
                    <option value="pagado">Solo pagados</option>
                  </Select>
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
                      {['Chofer', 'Ind.', 'Dobles', 'Claims (act/tot)', 'Ingreso Gofo', 'T.Ind', 'T.Doble', 'Desc. Claims', 'Total a Pagar', 'Ganancia', 'Estado', ''].map((h) => (
                        <th key={h} className="px-2.5 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 && (
                      <tr><td colSpan={12} className="px-4 py-6 text-center text-slate-400">Sin choferes con este filtro.</td></tr>
                    )}
                    {filtrados.map((p) => (
                      <FilaChofer
                        key={p.nombre}
                        p={p}
                        abierto={expandido === p.nombre}
                        onToggle={() => setExpandido(expandido === p.nombre ? null : p.nombre)}
                        onMarcar={marcarEstado}
                        puedeMarcar={!esRango}
                        claimsChofer={expandido === p.nombre ? claimsDeChofer(p.nombre) : []}
                        perdonandoId={perdonandoId}
                        motivo={motivo}
                        setMotivo={setMotivo}
                        setPerdonandoId={setPerdonandoId}
                        confirmarPerdon={confirmarPerdon}
                        restaurar={restaurar}
                        ocupado={ocupado}
                      />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 font-bold dark:bg-slate-800">
                      <td className="px-2.5 py-2.5">TOTAL ({filtrados.length})</td>
                      <td colSpan={3}></td>
                      <td className="px-2.5 py-2.5">{money(totIngreso)}</td>
                      <td colSpan={3}></td>
                      <td className="px-2.5 py-2.5">{money(totPagar)}</td>
                      <td className="px-2.5 py-2.5 text-brand-gold">{money(totGanancia)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                Fórmula: individuales × tarifa individual + dobles × tarifa doble − claims activos × multa por claim (configurable por empresa/ciudad). Perdonar un claim lo excluye del descuento y recalcula al instante.
              </p>
            </>
          )}
        </>
      )}
    </div>
  )
}

function FilaChofer({ p, abierto, onToggle, onMarcar, puedeMarcar, claimsChofer, perdonandoId, motivo, setMotivo, setPerdonandoId, confirmarPerdon, restaurar, ocupado }) {
  return (
    <>
      <tr className="border-t border-slate-100 hover:bg-slate-50 dark:border-slate-700/50 dark:hover:bg-slate-700/30">
        <td className={TD}>
          <button onClick={onToggle} className="font-semibold text-brand-navy dark:text-slate-100">
            {abierto ? '▾' : '▸'} {p.nombre}
          </button>{' '}
          {p.sinTarifa && <Badge color="red">sin tarifa</Badge>}
        </td>
        <td className={TD}>{num(p.individuales)}</td>
        <td className={TD}>{num(p.dobles)}</td>
        <td className={TD}>{p.claimsActivos}/{p.claimsTotales}{p.claimsPerdonados > 0 ? ` (${p.claimsPerdonados} perd.)` : ''}</td>
        <td className={TD}>{money(p.ingreso)}</td>
        <td className={TD}>{money(p.tarifaInd)}</td>
        <td className={TD}>{money(p.tarifaDoble)}</td>
        <td className={`${TD} text-rose-600 dark:text-rose-400`}>{money(p.descuentoClaims)}</td>
        <td className={`${TD} font-bold`}>{money(p.totalPagar)}</td>
        <td className={`${TD} ${p.ganancia >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>{money(p.ganancia)}</td>
        <td className={TD}>{p.estado === 'pagado' ? <Badge color="green">Pagado</Badge> : <Badge color="gold">Pendiente</Badge>}</td>
        <td className={TD}>
          {!puedeMarcar ? (
            <span className="text-xs text-slate-400">—</span>
          ) : p.estado === 'pagado' ? (
            <Boton variant="ghost" onClick={() => onMarcar(p, 'pendiente')} className="px-2 py-1 text-xs">Marcar pendiente</Boton>
          ) : (
            <Boton variant="success" onClick={() => onMarcar(p, 'pagado')} className="px-2 py-1 text-xs">Marcar pagado</Boton>
          )}
        </td>
      </tr>
      {abierto && (
        <tr className="bg-slate-50 dark:bg-slate-800/40">
          <td colSpan={12} className="px-4 py-2.5">
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
                        {c.perdonado ? <Badge color="green">Perdonado</Badge> : <Badge color="red">Activo (−{money(claimFeeDe(selectedInvoice, c.ciudad))})</Badge>}
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
