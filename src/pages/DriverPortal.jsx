// Portal del chofer (rol 'driver'). Acceso MUY limitado: SOLO sus propios datos.
// No usa DataContext (que carga datos de empresa); consulta Firestore filtrando
// por su driverKey/driverNombre, y las reglas de Firestore lo blindan además.
import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { Truck, DollarSign, Package, AlertTriangle, Star, LogOut, FileText, Wallet, ShieldCheck, Sun, Moon, Upload, CheckCircle2, Sparkles, Landmark } from 'lucide-react'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useTheme } from '../ThemeContext'
import { etiquetaTipoClaim } from '../utils/calc'
import { subirW9Chofer, guardarDatosBancariosChofer } from '../utils/verificacion'
import { W9_OFICIAL_URL } from '../utils/w9'
import { consejoChofer } from '../utils/consejoChofer'
import { BANCOS_EEUU } from '../utils/bancos'
import { exportarPDF } from '../utils/exportar'
import { money, num, pct } from '../utils/format'
import { Card, KPI, Boton, Badge, Tabla, Cargando, EstadoVacio, Aviso, Spinner, Input, Select } from '../components/ui'

const COLOR_NIVEL = { bueno: '#22c55e', regular: '#f59e0b', malo: '#ef4444' }

function Mini({ label, valor, color }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 dark:border-slate-700/60 dark:bg-slate-800/40">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-bold tabular-nums" style={color ? { color } : undefined}>{valor}</div>
    </div>
  )
}

function Campo({ label, children }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">{label}</div>
      {children}
    </div>
  )
}

function Estrellas({ n }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={18} strokeWidth={1.8} className={i <= n ? 'fill-brand-gold text-brand-gold' : 'text-slate-300 dark:text-slate-600'} />
      ))}
    </span>
  )
}

export default function DriverPortal() {
  const { perfil, companyId, driverId, driverNombre, driverKey, cerrarSesion } = useAuth()
  const { oscuro, alternar } = useTheme()
  const [stats, setStats] = useState(null) // driverStats del chofer
  const [claims, setClaims] = useState([])
  const [payroll, setPayroll] = useState({}) // invoiceId -> estado
  const [error, setError] = useState('')
  const [subiendoW9, setSubiendoW9] = useState(false)
  const [w9Msg, setW9Msg] = useState(null)
  const [w9Listo, setW9Listo] = useState(false)
  // Datos de pago (SSN + banco) que el chofer registra desde su portal.
  const [banco, setBanco] = useState({ ssn: '', bancoNombre: '', tipoCuenta: 'checking', cuentaNumero: '', rutaNumero: '' })
  const [guardandoBanco, setGuardandoBanco] = useState(false)
  const [bancoMsg, setBancoMsg] = useState(null)
  const [bancoListo, setBancoListo] = useState(false)
  const setB = (k, v) => setBanco((s) => ({ ...s, [k]: v }))

  const guardarBanco = async () => {
    setBancoMsg(null)
    if (String(banco.ssn).replace(/\D/g, '').length !== 9) return setBancoMsg({ tipo: 'error', txt: 'El SSN debe tener 9 dígitos.' })
    if (String(banco.rutaNumero).replace(/\D/g, '').length !== 9) return setBancoMsg({ tipo: 'error', txt: 'El número de ruta (routing) debe tener 9 dígitos.' })
    if (!banco.cuentaNumero.trim()) return setBancoMsg({ tipo: 'error', txt: 'Falta el número de cuenta.' })
    if (!banco.bancoNombre.trim()) return setBancoMsg({ tipo: 'error', txt: 'Elige tu banco.' })
    setGuardandoBanco(true)
    try {
      await guardarDatosBancariosChofer({ ...banco, ssn: String(banco.ssn).replace(/\D/g, '') })
      setBancoListo(true)
      setBancoMsg({ tipo: 'ok', txt: '¡Listo! Tus datos de pago se guardaron. Tu empresa ya puede verlos.' })
      setBanco({ ssn: '', bancoNombre: '', tipoCuenta: 'checking', cuentaNumero: '', rutaNumero: '' }) // no dejamos datos sensibles en memoria
    } catch (e) {
      setBancoMsg({ tipo: 'error', txt: e.message })
    } finally { setGuardandoBanco(false) }
  }

  const subirW9 = async (file) => {
    if (!file) return
    setSubiendoW9(true); setW9Msg(null)
    try {
      await subirW9Chofer(file)
      setW9Listo(true)
      setW9Msg({ tipo: 'ok', txt: '¡Listo! Tu W-9 se envió y quedó guardado. Tu empresa ya puede verlo.' })
    } catch (e) {
      setW9Msg({ tipo: 'error', txt: e.message })
    } finally { setSubiendoW9(false) }
  }

  useEffect(() => {
    let vivo = true
    ;(async () => {
      if (!companyId || (!driverKey && !driverNombre)) { setStats([]); return }
      try {
        const [s, c, p] = await Promise.all([
          getDocs(query(collection(db, 'driverStats'), where('companyId', '==', companyId), where('driverKey', '==', driverKey))),
          getDocs(query(collection(db, 'claims'), where('companyId', '==', companyId), where('courier', '==', driverNombre))),
          getDocs(query(collection(db, 'payroll'), where('companyId', '==', companyId), where('driverNombre', '==', driverNombre))),
        ])
        if (!vivo) return
        setStats(s.docs.map((d) => ({ id: d.id, ...d.data() })))
        setClaims(c.docs.map((d) => ({ id: d.id, ...d.data() })))
        const pm = {}
        p.docs.forEach((d) => { const x = d.data(); pm[x.invoiceId] = x.estado || 'pendiente' })
        setPayroll(pm)
      } catch (e) {
        if (vivo) { setError('No se pudieron cargar tus datos: ' + e.message); setStats([]) }
      }
    })()
    return () => { vivo = false }
  }, [companyId, driverKey, driverNombre])

  const semanas = useMemo(
    () => [...(stats || [])].sort((a, b) => String(b.fechaInicioISO || '').localeCompare(String(a.fechaInicioISO || ''))),
    [stats]
  )
  const ultima = semanas[0] || null
  const calif = ultima?.calificacion || null
  const consejo = useMemo(() => consejoChofer(semanas, calif), [semanas, calif])

  const totalPaquetes = semanas.reduce((a, w) => a + (w.paquetes || 0), 0)
  const totalClaims = semanas.reduce((a, w) => a + (w.claimsTotales || 0), 0)
  const totalPagado = semanas.filter((w) => payroll[w.invoiceId] === 'pagado').reduce((a, w) => a + (w.totalPagar || 0), 0)
  const totalPendiente = semanas.filter((w) => payroll[w.invoiceId] !== 'pagado').reduce((a, w) => a + (w.totalPagar || 0), 0)

  const recibo = (w) => {
    const estado = payroll[w.invoiceId] === 'pagado' ? 'Pagado' : 'Pendiente'
    exportarPDF(`recibo_${(driverNombre || 'chofer').replace(/[^\w]+/g, '_')}_${w.semana}`, 'Recibo de pago', `${driverNombre} · ${w.semana}`, [
      {
        titulo: 'Detalle del pago',
        head: ['Concepto', 'Valor'],
        body: [
          ['Individuales', num(w.individuales)],
          ['Dobles', num(w.dobles)],
          ['Total de paquetes', num(w.paquetes)],
          ['Tarifa individual', money(w.tarifaInd)],
          ['Tarifa doble', money(w.tarifaDoble)],
          ['Claims cobrados', num(w.claimsActivos)],
          ['Descuento por claims', money(-Math.abs(w.descuentoClaims || 0))],
          ['TOTAL A PAGAR', money(w.totalPagar)],
          ['Estado', estado],
        ],
      },
    ])
  }

  return (
    <div className="min-h-screen bg-surface-light text-slate-800 dark:bg-surface-dark dark:text-slate-100">
      {/* Header propio del portal (sin el chrome de la app) */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white/90 px-4 py-3 backdrop-blur dark:border-slate-700/60 dark:bg-surface-dark-card/90">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-navy"><FileText size={18} strokeWidth={1.9} className="text-brand-gold" /></div>
        <div>
          <div className="text-base font-extrabold leading-none text-brand-navy dark:text-white">MilePay</div>
          <div className="text-[11px] text-slate-400">Portal del chofer</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={alternar} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-700/40" title="Cambiar tema">
            {oscuro ? <Sun size={17} strokeWidth={1.8} /> : <Moon size={17} strokeWidth={1.8} />}
          </button>
          <Boton variant="ghost" onClick={cerrarSesion} className="px-3 py-1.5 text-sm"><LogOut size={15} strokeWidth={1.8} /> Salir</Boton>
        </div>
      </header>

      <main className="mx-auto max-w-4xl p-4 sm:p-6">
        {stats === null ? (
          <Cargando texto="Cargando tu portal…" />
        ) : (
          <>
            {/* Cabecera del chofer + calificación */}
            <Card className="mb-4 p-5">
              <div className="flex flex-wrap items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-navy text-brand-gold"><Truck size={26} strokeWidth={1.8} /></div>
                <div className="min-w-0 flex-1">
                  <h1 className="m-0 text-2xl font-bold text-brand-navy dark:text-slate-100">Hola, {driverNombre || perfil?.nombre || 'chofer'}</h1>
                  <p className="m-0 text-sm text-slate-500 dark:text-slate-400">Aquí ves solo tus pagos, entregas, claims y tu calificación.</p>
                </div>
                {calif && (
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2">
                      <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-extrabold text-white" style={{ background: COLOR_NIVEL[calif.nivel] }}>{calif.puntaje}</span>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-lg font-bold" style={{ color: COLOR_NIVEL[calif.nivel] }}>{calif.etiqueta}</span>
                          <Estrellas n={calif.estrellas} />
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">{calif.desglose}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Mi desempeño: asesor + calificación */}
            {semanas.length > 0 && (
              <Card className="mb-4 overflow-hidden">
                <div className={`p-5 ${consejo.tono === 'ojo' ? 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-500/10 dark:to-transparent' : 'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-500/10 dark:to-transparent'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl text-white ${consejo.tono === 'ojo' ? 'bg-amber-500' : 'bg-emerald-500'}`}>
                      <Sparkles size={20} strokeWidth={1.9} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h2 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{consejo.titulo}</h2>
                        <Badge color="navy">Tu asesor</Badge>
                      </div>
                      <p className="mt-1 mb-0 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{consejo.mensaje}</p>
                    </div>
                  </div>

                  {/* Mini métricas de desempeño de la última semana */}
                  <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Mini label="Claims (semana)" valor={num(ultima?.claimsTotales || 0)} />
                    <Mini label="Paquetes (semana)" valor={num(ultima?.paquetes || 0)} />
                    {calif && <Mini label="Calificación" valor={calif.etiqueta} color={COLOR_NIVEL[calif.nivel]} />}
                    {calif && <Mini label="Puntaje" valor={`${calif.puntaje}/100`} color={COLOR_NIVEL[calif.nivel]} />}
                  </div>
                  {calif && (
                    <div className="mt-3 flex items-center gap-2">
                      <Estrellas n={calif.estrellas} />
                      <span className="text-xs text-slate-500 dark:text-slate-400">{calif.desglose}</span>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Mis datos de pago (SSN + banco) */}
            <Card className="mb-4 p-5">
              <div className="mb-2 flex items-center gap-2">
                <Landmark size={18} strokeWidth={1.8} className="text-brand-gold" />
                <h2 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Mis datos de pago</h2>
                {bancoListo && <Badge color="green"><span className="inline-flex items-center gap-1"><CheckCircle2 size={13} strokeWidth={2} /> Guardado</span></Badge>}
              </div>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Registra tu <b>seguro social</b> y tu <b>cuenta bancaria</b> para recibir tus pagos. Solo tu empresa los verá.</p>
              {bancoMsg && <div className="mb-3"><Aviso tipo={bancoMsg.tipo}>{bancoMsg.txt}</Aviso></div>}
              {!driverId ? (
                <Aviso tipo="warn">Tu cuenta aún no está vinculada a tu registro de chofer. Pídele a tu empresa que la vincule para registrar tus datos.</Aviso>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Campo label="Seguro Social (SSN, 9 dígitos)">
                      <Input value={banco.ssn} inputMode="numeric" onChange={(e) => setB('ssn', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="123456789" />
                    </Campo>
                    <Campo label="Banco">
                      <Input list="bancos-eeuu-portal" value={banco.bancoNombre} onChange={(e) => setB('bancoNombre', e.target.value)} placeholder="Escribe o elige…" />
                      <datalist id="bancos-eeuu-portal">{BANCOS_EEUU.map((b) => <option key={b} value={b} />)}</datalist>
                    </Campo>
                    <Campo label="Tipo de cuenta">
                      <Select value={banco.tipoCuenta} onChange={(e) => setB('tipoCuenta', e.target.value)}>
                        <option value="checking">Corriente (checking)</option>
                        <option value="savings">Ahorros (savings)</option>
                      </Select>
                    </Campo>
                    <Campo label="Número de cuenta">
                      <Input value={banco.cuentaNumero} inputMode="numeric" onChange={(e) => setB('cuentaNumero', e.target.value.replace(/\s/g, ''))} />
                    </Campo>
                    <Campo label="Número de ruta (routing, 9 dígitos)">
                      <Input value={banco.rutaNumero} inputMode="numeric" onChange={(e) => setB('rutaNumero', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="110000000" />
                    </Campo>
                  </div>
                  <div className="mt-4">
                    <Boton variant="gold" onClick={guardarBanco} disabled={guardandoBanco}>
                      {guardandoBanco ? <><Spinner /> Guardando…</> : <><Landmark size={15} strokeWidth={1.8} /> {bancoListo ? 'Actualizar mis datos' : 'Guardar mis datos'}</>}
                    </Boton>
                  </div>
                </>
              )}
            </Card>

            {/* Documentos: subir mi W-9 (se envía y guarda para la empresa) */}
            <Card className="mb-4 p-5">
              <div className="mb-2 flex items-center gap-2">
                <FileText size={18} strokeWidth={1.8} className="text-brand-gold" />
                <h2 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Mi formulario W-9</h2>
                {w9Listo && <Badge color="green"><span className="inline-flex items-center gap-1"><CheckCircle2 size={13} strokeWidth={2} /> Enviado</span></Badge>}
              </div>
              <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
                Abre el <b>W-9 oficial del IRS</b>, llénalo en tu teléfono (nombre, dirección y tu SSN), guárdalo y <b>súbelo aquí</b>. Se envía a tu empresa y queda guardado — no tienes que mandarlo por otro lado.
              </p>
              {w9Msg && <div className="mb-3"><Aviso tipo={w9Msg.tipo}>{w9Msg.txt}</Aviso></div>}
              <div className="mb-3">
                <a href={W9_OFICIAL_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-sm font-semibold text-white no-underline hover:bg-brand-navy-700">
                  <FileText size={16} strokeWidth={1.8} /> Abrir y llenar el W-9 oficial (IRS)
                </a>
                <span className="ml-2 text-xs text-slate-400">Paso 1: llénalo · Paso 2: súbelo abajo</span>
              </div>
              {!driverId ? (
                <Aviso tipo="warn">Tu cuenta aún no está vinculada a tu registro de chofer. Pídele a tu empresa que la vincule para poder subir tu W-9.</Aviso>
              ) : (
                <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 ${subiendoW9 ? 'pointer-events-none opacity-60' : ''}`}>
                  {subiendoW9 ? <><Spinner /> Subiendo…</> : <><Upload size={16} strokeWidth={1.8} /> {w9Listo ? 'Subir otro' : 'Subir mi W-9 lleno'}</>}
                  <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => subirW9(e.target.files?.[0])} />
                </label>
              )}
            </Card>

            {error && <EstadoVacio titulo="Sin acceso a esos datos" texto={error} mostrarBoton={false} />}

            {semanas.length === 0 ? (
              <EstadoVacio titulo="Aún no hay datos" texto="Cuando tu empresa cargue una factura con tus entregas, verás aquí tus pagos y métricas." mostrarBoton={false} />
            ) : (
              <>
                {/* Resumen */}
                <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KPI label="Total pagado" value={money(totalPagado)} icon={Wallet} accent="green" />
                  <KPI label="Pendiente" value={money(totalPendiente)} icon={DollarSign} accent="gold" />
                  <KPI label="Paquetes (total)" value={num(totalPaquetes)} icon={Package} accent="navy" />
                  <KPI label="Claims (total)" value={num(totalClaims)} icon={AlertTriangle} accent="red" />
                </div>

                {/* Historial de pagos / entregas por semana */}
                <Card className="mb-4 p-4">
                  <h2 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Mis pagos y entregas por semana</h2>
                  <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                    <table className="w-full min-w-[640px] border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          <th className="px-3 py-2.5 text-left font-semibold">Semana</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Ind.</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Dobles</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Paquetes</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Claims</th>
                          <th className="px-3 py-2.5 text-right font-semibold">A pagar</th>
                          <th className="px-3 py-2.5 text-center font-semibold">Estado</th>
                          <th className="px-3 py-2.5 text-right font-semibold">Recibo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {semanas.map((w) => (
                          <tr key={w.id} className="border-t border-slate-100 dark:border-slate-700/50">
                            <td className="px-3 py-2">{w.semana}</td>
                            <td className="px-3 py-2 text-right">{num(w.individuales)}</td>
                            <td className="px-3 py-2 text-right">{num(w.dobles)}</td>
                            <td className="px-3 py-2 text-right">{num(w.paquetes)}</td>
                            <td className="px-3 py-2 text-right">{num(w.claimsTotales)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{money(w.totalPagar)}</td>
                            <td className="px-3 py-2 text-center">{payroll[w.invoiceId] === 'pagado' ? <Badge color="green">Pagado</Badge> : <Badge color="gold">Pendiente</Badge>}</td>
                            <td className="px-3 py-2 text-right"><Boton variant="ghost" onClick={() => recibo(w)} className="px-2.5 py-1 text-xs"><FileText size={13} strokeWidth={1.8} /> PDF</Boton></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Mis claims */}
                <Card className="p-4">
                  <h2 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Mis claims ({claims.length})</h2>
                  <Tabla
                    columns={[
                      { key: 'waybill', label: 'Tracking' },
                      { key: 'semana', label: 'Semana' },
                      { key: 'claimType', label: 'Tipo' },
                      { key: 'montoGofo', label: 'Descontado', align: 'right' },
                      { key: 'estado', label: 'Estado', align: 'center' },
                    ]}
                    rows={claims.map((c) => ({ ...c, _key: c.id }))}
                    emptyText="No tienes claims registrados. ¡Bien!"
                    renderCell={(row, key) => {
                      if (key === 'montoGofo') return money(Math.abs(Number(row.montoGofo) || 0))
                      if (key === 'claimType') return etiquetaTipoClaim(row.claimType)
                      if (key === 'estado') return row.estadoRevision === 'anulado' ? <Badge color="slate">Anulado</Badge> : row.perdonado ? <Badge color="green">Perdonado</Badge> : <Badge color="red">Activo</Badge>
                      return row[key] || '—'
                    }}
                  />
                </Card>

                <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
                  <ShieldCheck size={13} strokeWidth={1.8} /> Solo tú puedes ver esta información. No tienes acceso a datos de la empresa ni de otros choferes.
                </p>
              </>
            )}
          </>
        )}
      </main>
    </div>
  )
}
