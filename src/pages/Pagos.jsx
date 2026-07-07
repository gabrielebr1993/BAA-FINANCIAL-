import { useState, useEffect, useMemo, useCallback } from 'react'
import { collection, getDocs, query, where, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import * as XLSX from 'xlsx'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useData } from '../DataContext'
import { calcularPagos, porCiudad } from '../utils/calc'
import { perdonarClaim, quitarPerdon } from '../utils/claims'
import { CLAIM_FEE, COLORS } from '../constants'
import { money, num } from '../utils/format'
import { Card, Stat, PageTitle, Boton, Badge, Cargando, EstadoVacio } from '../components/ui'
import CitySelector, { InvoiceSelector } from '../components/CitySelector'

export default function Pagos() {
  const { perfil } = useAuth()
  const { selectedInvoice, selectedInvoiceId, claims, drivers, selectedCity, reloadClaims, cargando } = useData()
  const [payrollMap, setPayrollMap] = useState({})
  const [fEstado, setFEstado] = useState('')
  const [expandido, setExpandido] = useState(null)
  const [perdonandoId, setPerdonandoId] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const cargarPayroll = useCallback(async () => {
    if (!selectedInvoiceId) return setPayrollMap({})
    const snap = await getDocs(query(collection(db, 'payroll'), where('invoiceId', '==', selectedInvoiceId)))
    const map = {}
    snap.docs.forEach((d) => {
      map[d.data().driverNombre] = { id: d.id, ...d.data() }
    })
    setPayrollMap(map)
  }, [selectedInvoiceId])

  useEffect(() => {
    cargarPayroll()
  }, [cargarPayroll])

  const pagos = useMemo(
    () => calcularPagos(selectedInvoice, claims, drivers, selectedCity),
    [selectedInvoice, claims, drivers, selectedCity]
  )

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
    const existente = payrollMap[p.nombre]
    const payload = {
      invoiceId: selectedInvoiceId,
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

  return (
    <div>
      <PageTitle right={<><InvoiceSelector /><CitySelector /></>}>Pagos a Choferes</PageTitle>

      {cargando ? (
        <Cargando texto="Cargando pagos…" />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
            <Stat label="Ingreso total" value={money(totIngreso)} color={COLORS.green} />
            <Stat label="Total a pagar" value={money(totPagar)} color={COLORS.navy} />
            <Stat label="Ganancia total" value={money(totGanancia)} color={COLORS.gold} />
            <Stat label="Pendientes / Pagados" value={`${num(nPend)} / ${num(nPag)}`} />
          </div>

          {!selectedInvoice ? (
            <EstadoVacio texto="Cuando cargues una factura verás aquí el pago calculado de cada chofer." />
          ) : (
            <>
              <Card style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} style={selStyle}>
                    <option value="">Ver todos</option>
                    <option value="pendiente">Solo pendientes</option>
                    <option value="pagado">Solo pagados</option>
                  </select>
                  <Boton variant="gold" onClick={exportar} style={{ marginLeft: 'auto' }}>📤 Exportar a Excel</Boton>
                </div>
              </Card>

              <div style={{ overflowX: 'auto', border: `1px solid ${COLORS.border}`, borderRadius: 10 }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13.5, minWidth: 980 }}>
                  <thead>
                    <tr style={{ background: COLORS.navy, color: '#fff' }}>
                      {['Chofer', 'Ind.', 'Dobles', 'Claims (act/tot)', 'Ingreso Gofo', 'T.Ind', 'T.Doble', 'Desc. Claims', 'Total a Pagar', 'Ganancia', 'Estado', ''].map((h) => (
                        <th key={h} style={{ padding: '10px 10px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.length === 0 && (
                      <tr><td colSpan={12} style={{ padding: 20, textAlign: 'center', color: COLORS.muted }}>Sin choferes con este filtro.</td></tr>
                    )}
                    {filtrados.map((p, i) => {
                      const abierto = expandido === p.nombre
                      return (
                        <FilaChofer
                          key={p.nombre}
                          p={p}
                          i={i}
                          abierto={abierto}
                          onToggle={() => setExpandido(abierto ? null : p.nombre)}
                          onMarcar={marcarEstado}
                          claimsChofer={abierto ? claimsDeChofer(p.nombre) : []}
                          perdonandoId={perdonandoId}
                          motivo={motivo}
                          setMotivo={setMotivo}
                          setPerdonandoId={setPerdonandoId}
                          confirmarPerdon={confirmarPerdon}
                          restaurar={restaurar}
                          ocupado={ocupado}
                        />
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#eef1f6', fontWeight: 700 }}>
                      <td style={{ padding: '10px' }}>TOTAL ({filtrados.length})</td>
                      <td colSpan={3}></td>
                      <td style={{ padding: '10px' }}>{money(totIngreso)}</td>
                      <td colSpan={3}></td>
                      <td style={{ padding: '10px' }}>{money(totPagar)}</td>
                      <td style={{ padding: '10px', color: COLORS.gold }}>{money(totGanancia)}</td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 10 }}>
                Fórmula: individuales × tarifa individual + dobles × tarifa doble − claims activos × ${CLAIM_FEE}. Perdonar un claim lo excluye del descuento y recalcula al instante.
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function FilaChofer({ p, i, abierto, onToggle, onMarcar, claimsChofer, perdonandoId, motivo, setMotivo, setPerdonandoId, confirmarPerdon, restaurar, ocupado }) {
  const bg = i % 2 ? '#fafbfc' : '#fff'
  return (
    <>
      <tr style={{ borderTop: `1px solid ${COLORS.border}`, background: bg }}>
        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
          <button onClick={onToggle} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, color: COLORS.navy }}>
            {abierto ? '▾' : '▸'} {p.nombre}
          </button>
          {p.sinTarifa && <Badge color={COLORS.red}>sin tarifa</Badge>}
        </td>
        <td style={{ padding: '9px 10px' }}>{num(p.individuales)}</td>
        <td style={{ padding: '9px 10px' }}>{num(p.dobles)}</td>
        <td style={{ padding: '9px 10px' }}>{p.claimsActivos}/{p.claimsTotales}{p.claimsPerdonados > 0 ? ` (${p.claimsPerdonados} perd.)` : ''}</td>
        <td style={{ padding: '9px 10px' }}>{money(p.ingreso)}</td>
        <td style={{ padding: '9px 10px' }}>{money(p.tarifaInd)}</td>
        <td style={{ padding: '9px 10px' }}>{money(p.tarifaDoble)}</td>
        <td style={{ padding: '9px 10px', color: COLORS.red }}>{money(p.descuentoClaims)}</td>
        <td style={{ padding: '9px 10px', fontWeight: 700 }}>{money(p.totalPagar)}</td>
        <td style={{ padding: '9px 10px', color: p.ganancia >= 0 ? COLORS.green : COLORS.red }}>{money(p.ganancia)}</td>
        <td style={{ padding: '9px 10px' }}>
          {p.estado === 'pagado' ? <Badge color={COLORS.green}>Pagado</Badge> : <Badge color={COLORS.gold}>Pendiente</Badge>}
        </td>
        <td style={{ padding: '9px 10px', whiteSpace: 'nowrap' }}>
          {p.estado === 'pagado' ? (
            <Boton variant="ghost" onClick={() => onMarcar(p, 'pendiente')} style={{ padding: '4px 8px', fontSize: 12 }}>Marcar pendiente</Boton>
          ) : (
            <Boton variant="success" onClick={() => onMarcar(p, 'pagado')} style={{ padding: '4px 8px', fontSize: 12 }}>Marcar pagado</Boton>
          )}
        </td>
      </tr>
      {abierto && (
        <tr style={{ background: '#f7f9fc' }}>
          <td colSpan={12} style={{ padding: '10px 16px' }}>
            <div style={{ fontWeight: 600, color: COLORS.navy, marginBottom: 8 }}>Claims de {p.nombre} ({claimsChofer.length})</div>
            {claimsChofer.length === 0 ? (
              <div style={{ color: COLORS.muted, fontSize: 13 }}>Sin claims.</div>
            ) : (
              <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
                <tbody>
                  {claimsChofer.map((c) => (
                    <tr key={c.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                      <td style={{ padding: '6px 8px' }}>{c.waybill}</td>
                      <td style={{ padding: '6px 8px' }}>{c.date}</td>
                      <td style={{ padding: '6px 8px' }}>{c.claimType}</td>
                      <td style={{ padding: '6px 8px' }}>{money(c.montoGofo)}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {c.perdonado ? <Badge color={COLORS.green}>Perdonado</Badge> : <Badge color={COLORS.red}>Activo (−${CLAIM_FEE})</Badge>}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                        {perdonandoId === c.id ? (
                          <span style={{ display: 'inline-flex', gap: 6 }}>
                            <input autoFocus placeholder="Motivo…" value={motivo} onChange={(e) => setMotivo(e.target.value)} style={{ ...selStyle, width: 140 }} />
                            <Boton variant="success" disabled={ocupado} onClick={() => confirmarPerdon(c)} style={{ padding: '4px 8px', fontSize: 12 }}>OK</Boton>
                            <Boton variant="ghost" onClick={() => { setPerdonandoId(null); setMotivo('') }} style={{ padding: '4px 8px', fontSize: 12 }}>✕</Boton>
                          </span>
                        ) : c.perdonado ? (
                          <Boton variant="ghost" disabled={ocupado} onClick={() => restaurar(c)} style={{ padding: '4px 8px', fontSize: 12 }}>Quitar perdón</Boton>
                        ) : (
                          <Boton variant="ghost" onClick={() => { setPerdonandoId(c.id); setMotivo('') }} style={{ padding: '4px 8px', fontSize: 12 }}>Perdonar</Boton>
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

const selStyle = { padding: '8px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, fontSize: 14, background: '#fff' }
