// Portal del chofer (rol 'driver'). Acceso MUY limitado: SOLO sus propios datos.
// Menú lateral con: Inicio (pagos), Performance, Perfil (rating + foto) y Documentos
// (datos de pago, W-9, licencia). No usa DataContext (que carga datos de empresa);
// consulta Firestore filtrando por su driverKey/driverNombre, y las reglas lo blindan.
// Los datos sensibles y archivos se guardan vía endpoint serverless (Admin SDK).
import { useEffect, useMemo, useState, useCallback } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import {
  Truck, DollarSign, Package, AlertTriangle, Star, LogOut, FileText, Wallet, ShieldCheck, Sun, Moon,
  Upload, CheckCircle2, Sparkles, Landmark, Home, BarChart3, Award, IdCard, Camera, Lock, Circle,
} from 'lucide-react'
import { db } from '../firebase'
import { useAuth } from '../AuthContext'
import { useTheme } from '../ThemeContext'
import { etiquetaTipoClaim } from '../utils/calc'
import { subirW9Chofer, guardarDatosBancariosChofer, subirFotoChofer, subirLicenciaChofer, estadoChoferPortal, firmarW9Chofer } from '../utils/verificacion'
import { consejoChofer } from '../utils/consejoChofer'
import { BANCOS_EEUU } from '../utils/bancos'
import { W9_OFICIAL_URL } from '../utils/w9'
import FirmaCanvas from '../components/FirmaCanvas'
import { exportarPDF } from '../utils/exportar'
import { money, num } from '../utils/format'
import { Card, KPI, Boton, Badge, Tabla, Cargando, EstadoVacio, Aviso, Spinner, Input, Select } from '../components/ui'

const COLOR_NIVEL = { bueno: '#22c55e', regular: '#f59e0b', malo: '#ef4444' }

const MENU = [
  { k: 'inicio', label: 'Inicio', icon: Home },
  { k: 'performance', label: 'Performance', icon: BarChart3 },
  { k: 'perfil', label: 'Mi perfil', icon: Award },
  { k: 'documentos', label: 'Documentos', icon: IdCard },
]

export default function DriverPortal() {
  const { perfil, companyId, driverId, driverNombre, driverKey, cerrarSesion } = useAuth()
  const { oscuro, alternar } = useTheme()
  const [vista, setVista] = useState('inicio')
  const [stats, setStats] = useState(null) // driverStats del chofer
  const [claims, setClaims] = useState([])
  const [payroll, setPayroll] = useState({}) // invoiceId -> estado
  const [error, setError] = useState('')

  // Estado de verificación (bloqueo, prefill, foto, documentos) desde el servidor.
  const [estado, setEstado] = useState(null)
  const cargarEstado = useCallback(async () => {
    if (!driverId) { setEstado({}); return }
    try { setEstado(await estadoChoferPortal()) } catch { setEstado({}) }
  }, [driverId])
  useEffect(() => { cargarEstado() }, [cargarEstado])

  // ---- W-9 ----
  const [subiendoW9, setSubiendoW9] = useState(false)
  const [w9Msg, setW9Msg] = useState(null)
  const [firmando, setFirmando] = useState(false)
  const [firmaPng, setFirmaPng] = useState(null)
  const [enviandoFirma, setEnviandoFirma] = useState(false)
  const [subirManual, setSubirManual] = useState(false)
  // ---- Licencia ----
  const [subiendoLic, setSubiendoLic] = useState(false)
  const [licMsg, setLicMsg] = useState(null)
  // ---- Foto ----
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [fotoMsg, setFotoMsg] = useState(null)
  // ---- Datos de pago ----
  const [banco, setBanco] = useState({ nombreCompleto: '', direccion: '', ssn: '', bancoNombre: '', tipoCuenta: 'checking', cuentaNumero: '', rutaNumero: '' })
  const [guardandoBanco, setGuardandoBanco] = useState(false)
  const [bancoMsg, setBancoMsg] = useState(null)
  const setB = (k, v) => setBanco((s) => ({ ...s, [k]: v }))

  // Prefill de nombre/dirección cuando llega el estado (auto-rellenado).
  useEffect(() => {
    if (!estado) return
    setBanco((s) => ({ ...s, nombreCompleto: s.nombreCompleto || estado.nombreCompleto || driverNombre || '', direccion: s.direccion || estado.direccion || '', bancoNombre: s.bancoNombre || estado.bancoNombre || '', tipoCuenta: s.tipoCuenta || estado.tipoCuenta || 'checking' }))
  }, [estado, driverNombre])

  const subirW9 = async (file) => {
    if (!file) return
    setSubiendoW9(true); setW9Msg(null)
    try { await subirW9Chofer(file); await cargarEstado(); setW9Msg({ tipo: 'ok', txt: '¡Listo! Tu W-9 se envió y quedó guardado.' }) }
    catch (e) { setW9Msg({ tipo: 'error', txt: e.message }) } finally { setSubiendoW9(false) }
  }
  const firmarW9 = async () => {
    if (!firmaPng) return
    setEnviandoFirma(true); setW9Msg(null)
    try {
      await firmarW9Chofer(firmaPng, new Date().toLocaleDateString())
      await cargarEstado()
      setFirmando(false); setFirmaPng(null)
      setW9Msg({ tipo: 'ok', txt: '¡Listo! Tu W-9 firmado se generó y quedó guardado. Tu empresa ya puede verlo.' })
    } catch (e) { setW9Msg({ tipo: 'error', txt: e.message }) } finally { setEnviandoFirma(false) }
  }

  const subirLic = async (file) => {
    if (!file) return
    setSubiendoLic(true); setLicMsg(null)
    try { await subirLicenciaChofer(file); await cargarEstado(); setLicMsg({ tipo: 'ok', txt: '¡Listo! Tu licencia se envió y quedó guardada.' }) }
    catch (e) { setLicMsg({ tipo: 'error', txt: e.message }) } finally { setSubiendoLic(false) }
  }
  const subirFoto = async (file) => {
    if (!file) return
    setSubiendoFoto(true); setFotoMsg(null)
    try { await subirFotoChofer(file); await cargarEstado(); setFotoMsg({ tipo: 'ok', txt: 'Foto actualizada.' }) }
    catch (e) { setFotoMsg({ tipo: 'error', txt: e.message }) } finally { setSubiendoFoto(false) }
  }

  const guardarBanco = async () => {
    setBancoMsg(null)
    if (!banco.nombreCompleto.trim()) return setBancoMsg({ tipo: 'error', txt: 'Falta tu nombre completo.' })
    if (!banco.direccion.trim()) return setBancoMsg({ tipo: 'error', txt: 'Falta tu dirección.' })
    if (String(banco.ssn).replace(/\D/g, '').length !== 9) return setBancoMsg({ tipo: 'error', txt: 'El SSN debe tener 9 dígitos.' })
    if (String(banco.rutaNumero).replace(/\D/g, '').length !== 9) return setBancoMsg({ tipo: 'error', txt: 'El número de ruta (routing) debe tener 9 dígitos.' })
    if (!banco.cuentaNumero.trim()) return setBancoMsg({ tipo: 'error', txt: 'Falta el número de cuenta.' })
    if (!banco.bancoNombre.trim()) return setBancoMsg({ tipo: 'error', txt: 'Elige tu banco.' })
    setGuardandoBanco(true)
    try {
      await guardarDatosBancariosChofer({ ...banco, ssn: String(banco.ssn).replace(/\D/g, '') })
      await cargarEstado()
      setBancoMsg({ tipo: 'ok', txt: '¡Listo! Tus datos de pago se guardaron y quedaron bloqueados. Tu empresa ya puede verlos.' })
      setBanco((s) => ({ ...s, ssn: '', cuentaNumero: '', rutaNumero: '' })) // no dejar datos sensibles en memoria
    } catch (e) {
      setBancoMsg({ tipo: 'error', txt: e.message })
    } finally { setGuardandoBanco(false) }
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

  // El chofer SOLO ve las semanas/recibos que el dueño ya marcó como PAGADAS. Si el
  // dueño las regresa a "pendiente", desaparecen de su vista.
  const semanasPagadas = useMemo(() => semanas.filter((w) => payroll[w.invoiceId] === 'pagado'), [semanas, payroll])
  const totalPagado = semanasPagadas.reduce((a, w) => a + (w.totalPagar || 0), 0)
  const totalPaquetes = semanasPagadas.reduce((a, w) => a + (w.paquetes || 0), 0)
  const totalClaims = semanasPagadas.reduce((a, w) => a + (w.claimsTotales || 0), 0)

  const recibo = (w) => {
    const estadoPago = payroll[w.invoiceId] === 'pagado' ? 'Pagado' : 'Pendiente'
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
          ['Estado', estadoPago],
        ],
      },
    ])
  }

  // Bloqueo de datos: enviado y sin permiso de edición del dueño.
  const bloqueado = !!(estado?.bloqueado && !estado?.puedeActualizar)
  const fotoUrl = estado?.fotoUrl || ''

  // Checklist para el 1099 / W-9.
  const req = {
    nombre: !!(banco.nombreCompleto?.trim() || estado?.nombreCompleto),
    direccion: !!(banco.direccion?.trim() || estado?.direccion),
    datos: !!estado?.tieneDatos,
    w9: !!(estado?.w9Url),
    licencia: !!(estado?.licenciaUrl),
  }
  const listo1099 = req.nombre && req.direccion && req.datos && req.w9

  return (
    <div className="min-h-screen bg-surface-light text-slate-800 dark:bg-surface-dark dark:text-slate-100">
      {/* Header propio del portal */}
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

      {stats === null ? (
        <Cargando texto="Cargando tu portal…" />
      ) : (
        <>
        <div className="mx-auto max-w-5xl p-3 pb-24 sm:flex sm:gap-6 sm:p-6 sm:pb-6">
          {/* Sidebar (tablet/PC) */}
          <nav className="hidden w-52 flex-shrink-0 flex-col gap-1 self-start rounded-2xl bg-white p-2 shadow-card dark:bg-surface-dark-card sm:sticky sm:top-[64px] sm:flex">
            {MENU.map((m) => {
              const Icon = m.icon
              const activo = vista === m.k
              return (
                <button key={m.k} onClick={() => setVista(m.k)}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${activo ? 'bg-brand-navy text-white shadow-sm dark:bg-brand-gold dark:text-brand-navy' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
                  <Icon size={20} strokeWidth={1.9} className="flex-shrink-0" /> <span>{m.label}</span>
                </button>
              )
            })}
          </nav>

          {/* Contenido */}
          <main className="min-w-0 flex-1">
            {error && <EstadoVacio titulo="Sin acceso a esos datos" texto={error} mostrarBoton={false} />}

            {/* ---------- INICIO ---------- */}
            {vista === 'inicio' && (
              <>
                <Card className="mb-4 overflow-hidden">
                  <div className="relative overflow-hidden bg-gradient-to-br from-brand-navy to-brand-steel p-5 sm:p-6">
                    {/* Resplandor dorado suave y difuminado (decorativo) */}
                    <div className="pointer-events-none absolute -bottom-16 -right-8 h-52 w-52 rounded-full bg-brand-gold/25 blur-3xl" aria-hidden />
                    <div className="pointer-events-none absolute -top-12 left-16 h-36 w-36 rounded-full bg-brand-gold/10 blur-3xl" aria-hidden />
                    <div className="relative text-[11px] font-medium uppercase tracking-wide text-white/50">Portal del chofer</div>
                    <h1 className="mt-0.5 text-xl font-bold text-white sm:text-2xl">Hola, {driverNombre || perfil?.nombre || 'chofer'}</h1>
                    <p className="mt-1 text-sm text-white/70">Tus pagos, entregas, claims y tu calificación.</p>
                    {calif && (
                      <div className="mt-4 inline-flex items-center gap-2.5 rounded-2xl bg-white/10 px-3 py-2 ring-1 ring-white/15">
                        <span className="grid h-10 w-10 place-items-center rounded-full text-sm font-extrabold text-white ring-2 ring-white/40" style={{ background: COLOR_NIVEL[calif.nivel] }}>{calif.puntaje}</span>
                        <div>
                          <div className="flex items-center gap-1.5 text-sm font-bold text-white">{calif.etiqueta} <EstrellasBlancas n={calif.estrellas} /></div>
                          <div className="text-[11px] text-white/70">{calif.desglose}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </Card>

                {semanasPagadas.length === 0 ? (
                  <EstadoVacio titulo="Aún no tienes pagos" texto="Cuando tu empresa apruebe y marque como pagada una de tus semanas, verás aquí tu recibo y el detalle. Mientras tanto, no aparece nada." mostrarBoton={false} />
                ) : (
                  <>
                    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <KPI label="Total pagado" value={money(totalPagado)} icon={Wallet} accent="green" />
                      <KPI label="Semanas pagadas" value={num(semanasPagadas.length)} icon={CheckCircle2} accent="navy" />
                      <KPI label="Paquetes (pagados)" value={num(totalPaquetes)} icon={Package} accent="navy" />
                      <KPI label="Claims (pagados)" value={num(totalClaims)} icon={AlertTriangle} accent="red" />
                    </div>

                    <Card className="mb-4 p-4">
                      <h2 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Mis pagos y entregas</h2>
                      <div className="scroll-thin overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                        <table className="w-full min-w-[600px] border-collapse text-sm">
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
                            {semanasPagadas.map((w) => (
                              <tr key={w.id} className="border-t border-slate-100 dark:border-slate-700/50">
                                <td className="px-3 py-2">{w.semana}</td>
                                <td className="px-3 py-2 text-right">{num(w.individuales)}</td>
                                <td className="px-3 py-2 text-right">{num(w.dobles)}</td>
                                <td className="px-3 py-2 text-right">{num(w.paquetes)}</td>
                                <td className="px-3 py-2 text-right">{num(w.claimsTotales)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{money(w.totalPagar)}</td>
                                <td className="px-3 py-2 text-center"><Badge color="green">Pagado</Badge></td>
                                <td className="px-3 py-2 text-right"><Boton variant="ghost" onClick={() => recibo(w)} className="px-2.5 py-1 text-xs"><FileText size={13} strokeWidth={1.8} /> PDF</Boton></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>

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
                  </>
                )}
              </>
            )}

            {/* ---------- PERFORMANCE ---------- */}
            {vista === 'performance' && (
              semanas.length === 0 ? (
                <EstadoVacio titulo="Aún no hay datos" texto="Cuando tu empresa cargue tu primera semana, aquí verás tu desempeño." mostrarBoton={false} />
              ) : (
                <Card className="overflow-hidden">
                  <div className={`p-5 ${consejo.tono === 'ojo' ? 'bg-gradient-to-br from-amber-50 to-white dark:from-amber-500/10 dark:to-transparent' : 'bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-500/10 dark:to-transparent'}`}>
                    <div className="flex items-start gap-3">
                      <div className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-2xl text-white ${consejo.tono === 'ojo' ? 'bg-amber-500' : 'bg-emerald-500'}`}><Sparkles size={20} strokeWidth={1.9} /></div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h2 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{consejo.titulo}</h2>
                          <Badge color="navy">Tu asesor</Badge>
                        </div>
                        <p className="mt-1 mb-0 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{consejo.mensaje}</p>
                      </div>
                    </div>
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
              )
            )}

            {/* ---------- MI PERFIL ---------- */}
            {vista === 'perfil' && (
              <Card className="overflow-hidden">
                <div className="relative h-24 overflow-hidden bg-gradient-to-br from-brand-navy via-brand-navy to-brand-steel">
                  {/* Resplandor dorado suave y difuminado (decorativo) */}
                  <div className="pointer-events-none absolute -bottom-16 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full bg-brand-gold/25 blur-3xl" aria-hidden />
                </div>
                <div className="px-5 pb-5 text-center sm:px-7">
                <div className="-mt-12 flex flex-col items-center gap-3">
                  <div className="relative">
                    {/* Halo dorado difuminado detrás de la foto */}
                    <div className="pointer-events-none absolute -inset-2.5 rounded-[1.4rem] bg-brand-gold/40 blur-xl dark:bg-brand-gold/30" aria-hidden />
                    <div className="relative"><Foto url={fotoUrl} size={96} ringClass="ring-4 ring-white dark:ring-surface-dark-card shadow-lg" /></div>
                  </div>
                  <div>
                    <h2 className="m-0 text-xl font-bold text-brand-navy dark:text-slate-100">{driverNombre || perfil?.nombre || 'Chofer'}</h2>
                    {perfil?.email && <div className="text-sm text-slate-400">{perfil.email}</div>}
                  </div>
                  {fotoMsg && <div className="w-full max-w-sm"><Aviso tipo={fotoMsg.tipo}>{fotoMsg.txt}</Aviso></div>}
                  <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 ${subiendoFoto ? 'pointer-events-none opacity-60' : ''}`}>
                    {subiendoFoto ? <><Spinner /> Subiendo…</> : <><Camera size={16} strokeWidth={1.8} /> {fotoUrl ? 'Cambiar foto' : 'Subir foto de perfil'}</>}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => subirFoto(e.target.files?.[0])} />
                  </label>
                </div>

                {/* Rating / ranking */}
                <div className="mt-5 rounded-2xl border border-slate-200 p-4 dark:border-slate-700/60">
                  <div className="mb-3 flex items-center gap-2">
                    <Award size={18} strokeWidth={1.8} className="text-brand-gold" />
                    <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Mi calificación</h3>
                  </div>
                  {calif ? (
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="grid h-16 w-16 place-items-center rounded-2xl text-2xl font-extrabold text-white" style={{ background: COLOR_NIVEL[calif.nivel] }}>{calif.puntaje}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xl font-bold" style={{ color: COLOR_NIVEL[calif.nivel] }}>{calif.etiqueta}</span>
                          <Estrellas n={calif.estrellas} />
                        </div>
                        <div className="text-sm text-slate-500 dark:text-slate-400">{calif.desglose}</div>
                        <div className="mt-1 text-xs text-slate-400">Semana: {ultima?.semana}</div>
                      </div>
                    </div>
                  ) : (
                    <p className="m-0 text-sm text-slate-400">Tu calificación aparecerá cuando tu empresa cargue tus entregas.</p>
                  )}
                </div>
                </div>
              </Card>
            )}

            {/* ---------- DOCUMENTOS ---------- */}
            {vista === 'documentos' && (
              <>
                {/* Checklist 1099 */}
                <Card className="mb-4 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <ShieldCheck size={18} strokeWidth={1.8} className="text-brand-gold" />
                    <h2 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Requisitos para tu 1099</h2>
                    {listo1099 ? <Badge color="green">Completo ✓</Badge> : <Badge color="gold">Faltan datos</Badge>}
                  </div>
                  <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Completa <b>todos</b> los campos para poder generar tu 1099 a fin de año.</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <ReqItem ok={req.nombre} label="Nombre completo" />
                    <ReqItem ok={req.direccion} label="Dirección" />
                    <ReqItem ok={req.datos} label="SSN y datos bancarios" />
                    <ReqItem ok={req.w9} label="Formulario W-9 subido" />
                    <ReqItem ok={req.licencia} label="Licencia / ID (recomendado)" />
                  </div>
                </Card>

                {!driverId ? (
                  <Aviso tipo="warn">Tu cuenta aún no está vinculada a tu registro de chofer. Pídele a tu empresa que la vincule.</Aviso>
                ) : (
                  <>
                    {/* Datos de pago */}
                    <Card className="mb-4 p-5">
                      <div className="mb-2 flex items-center gap-2">
                        <Landmark size={18} strokeWidth={1.8} className="text-brand-gold" />
                        <h2 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Mis datos de pago</h2>
                        {estado?.tieneDatos && <Badge color="green"><span className="inline-flex items-center gap-1"><CheckCircle2 size={13} strokeWidth={2} /> Guardado</span></Badge>}
                        {bloqueado && <Badge color="slate"><span className="inline-flex items-center gap-1"><Lock size={12} strokeWidth={2} /> Bloqueado</span></Badge>}
                      </div>
                      {bancoMsg && <div className="mb-3"><Aviso tipo={bancoMsg.tipo}>{bancoMsg.txt}</Aviso></div>}

                      {bloqueado ? (
                        <Aviso tipo="info">
                          Ya enviaste tus datos y están <b>bloqueados</b> por seguridad. Si necesitas cambiarlos, pídele a tu empresa que <b>habilite la edición</b>; entonces podrás actualizarlos aquí.
                        </Aviso>
                      ) : (
                        <>
                          {estado?.puedeActualizar && estado?.tieneDatos && <Aviso tipo="ok">Tu empresa habilitó la edición. Vuelve a llenar tus datos para actualizarlos.</Aviso>}
                          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Registra tu <b>nombre</b>, <b>dirección</b>, <b>seguro social</b> y tu <b>cuenta bancaria</b> para recibir tus pagos. Solo tu empresa los verá.</p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Campo label="Nombre completo (legal)"><Input value={banco.nombreCompleto} onChange={(e) => setB('nombreCompleto', e.target.value)} /></Campo>
                            <Campo label="Dirección"><Input value={banco.direccion} onChange={(e) => setB('direccion', e.target.value)} placeholder="Calle, ciudad, estado, ZIP" /></Campo>
                            <Campo label="Seguro Social (SSN, 9 dígitos)"><Input value={banco.ssn} inputMode="numeric" onChange={(e) => setB('ssn', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="123456789" /></Campo>
                            <Campo label="Banco (lista de EE. UU.)">
                              <Select value={banco.bancoNombre} onChange={(e) => setB('bancoNombre', e.target.value)}>
                                <option value="">— Elige tu banco —</option>
                                {BANCOS_EEUU.map((b) => <option key={b} value={b}>{b}</option>)}
                              </Select>
                            </Campo>
                            <Campo label="Tipo de cuenta">
                              <Select value={banco.tipoCuenta} onChange={(e) => setB('tipoCuenta', e.target.value)}>
                                <option value="checking">Corriente (checking)</option>
                                <option value="savings">Ahorros (savings)</option>
                              </Select>
                            </Campo>
                            <Campo label="Número de cuenta"><Input value={banco.cuentaNumero} inputMode="numeric" onChange={(e) => setB('cuentaNumero', e.target.value.replace(/\s/g, ''))} /></Campo>
                            <Campo label="Número de ruta (routing, 9 dígitos)"><Input value={banco.rutaNumero} inputMode="numeric" onChange={(e) => setB('rutaNumero', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="110000000" /></Campo>
                          </div>
                          <div className="mt-4">
                            <Boton variant="gold" onClick={guardarBanco} disabled={guardandoBanco}>
                              {guardandoBanco ? <><Spinner /> Guardando…</> : <><Landmark size={15} strokeWidth={1.8} /> Guardar mis datos</>}
                            </Boton>
                          </div>
                        </>
                      )}
                    </Card>

                    {/* W-9 */}
                    <Card className="mb-4 p-5">
                      <div className="mb-2 flex items-center gap-2">
                        <FileText size={18} strokeWidth={1.8} className="text-brand-gold" />
                        <h2 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Mi formulario W-9</h2>
                        {estado?.w9Url && <Badge color="green"><span className="inline-flex items-center gap-1"><CheckCircle2 size={13} strokeWidth={2} /> Enviado</span></Badge>}
                        {!estado?.w9Url && estado?.w9Solicitado && <Badge color="gold">Solicitado</Badge>}
                      </div>
                      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">El sistema <b>llena tu W-9</b> con los datos que guardaste. Tú solo tienes que <b>firmar</b> aquí mismo (como DocuSign).</p>
                      {w9Msg && <div className="mb-3"><Aviso tipo={w9Msg.tipo}>{w9Msg.txt}</Aviso></div>}

                      {!estado?.completo ? (
                        <Aviso tipo="warn">Primero completa y guarda <b>todos</b> tus datos de pago (nombre, dirección, SSN y banco) arriba. Cuando estén completos, podrás firmar tu W-9.</Aviso>
                      ) : !firmando ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <Boton variant="gold" onClick={() => { setFirmando(true); setFirmaPng(null); setW9Msg(null) }}>
                            <FileText size={15} strokeWidth={1.8} /> {estado?.w9Url ? 'Volver a firmar mi W-9' : 'Firmar mi W-9'}
                          </Boton>
                          {estado?.w9Url && <a href={estado.w9Url} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">Ver mi W-9 {estado?.w9Firmado ? 'firmado' : ''}</a>}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
                          {/* Vista de los datos que llevará el W-9 */}
                          <div className="mb-3 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
                            <div><span className="text-slate-400">Nombre:</span> <b>{estado?.nombreCompleto || driverNombre}</b></div>
                            <div><span className="text-slate-400">Dirección:</span> <b>{estado?.direccion || '—'}</b></div>
                            <div><span className="text-slate-400">SSN:</span> <b>•••-••-••••</b></div>
                            <div><span className="text-slate-400">Fecha:</span> <b>{new Date().toLocaleDateString()}</b></div>
                          </div>
                          <div className="mb-1 text-xs font-medium text-slate-500 dark:text-slate-400">Tu firma</div>
                          <FirmaCanvas onFirma={setFirmaPng} />
                          <div className="mt-3 flex flex-wrap justify-end gap-2">
                            <Boton variant="ghost" onClick={() => { setFirmando(false); setFirmaPng(null) }} disabled={enviandoFirma}>Cancelar</Boton>
                            <Boton variant="gold" onClick={firmarW9} disabled={!firmaPng || enviandoFirma}>
                              {enviandoFirma ? <><Spinner /> Generando…</> : <><FileText size={15} strokeWidth={1.8} /> Firmar y enviar W-9</>}
                            </Boton>
                          </div>
                          {!firmaPng && <p className="mt-1 text-right text-[11px] text-slate-400">Dibuja tu firma y toca “Usar esta firma”.</p>}
                        </div>
                      )}

                      {/* Alternativa: subir el W-9 oficial manualmente */}
                      <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-700/50">
                        <button onClick={() => setSubirManual((s) => !s)} className="text-xs font-semibold text-slate-500 hover:text-brand-navy dark:hover:text-slate-200">
                          {subirManual ? '− Ocultar' : '¿Prefieres subir tu propio W-9? (opcional)'}
                        </button>
                        {subirManual && (
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <a href={W9_OFICIAL_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-brand-navy no-underline hover:border-brand-gold dark:border-slate-600 dark:text-slate-200">
                              <FileText size={15} strokeWidth={1.8} /> Abrir W-9 oficial (IRS)
                            </a>
                            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 ${subiendoW9 ? 'pointer-events-none opacity-60' : ''}`}>
                              {subiendoW9 ? <><Spinner /> Subiendo…</> : <><Upload size={15} strokeWidth={1.8} /> Subir W-9 lleno</>}
                              <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => subirW9(e.target.files?.[0])} />
                            </label>
                          </div>
                        )}
                      </div>
                    </Card>

                    {/* Licencia */}
                    <Card className="p-5">
                      <div className="mb-2 flex items-center gap-2">
                        <IdCard size={18} strokeWidth={1.8} className="text-brand-gold" />
                        <h2 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Mi licencia / ID</h2>
                        {estado?.licenciaUrl && <Badge color="green"><span className="inline-flex items-center gap-1"><CheckCircle2 size={13} strokeWidth={2} /> Enviada</span></Badge>}
                      </div>
                      <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Sube una foto o PDF de tu <b>licencia de conducir o identificación</b>. Solo tu empresa la verá.</p>
                      {licMsg && <div className="mb-3"><Aviso tipo={licMsg.tipo}>{licMsg.txt}</Aviso></div>}
                      <div className="flex flex-wrap items-center gap-2">
                        <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-brand-gold dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 ${subiendoLic ? 'pointer-events-none opacity-60' : ''}`}>
                          {subiendoLic ? <><Spinner /> Subiendo…</> : <><Upload size={16} strokeWidth={1.8} /> {estado?.licenciaUrl ? 'Subir otra' : 'Subir mi licencia'}</>}
                          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => subirLic(e.target.files?.[0])} />
                        </label>
                        {estado?.licenciaUrl && <a href={estado.licenciaUrl} target="_blank" rel="noreferrer" className="text-sm font-medium text-emerald-600 hover:underline dark:text-emerald-400">Ver mi licencia</a>}
                      </div>
                    </Card>
                  </>
                )}
              </>
            )}

            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400">
              <ShieldCheck size={13} strokeWidth={1.8} /> Solo tú puedes ver esta información. No tienes acceso a datos de la empresa ni de otros choferes.
            </p>
          </main>
        </div>

        {/* Barra inferior (móvil) — estilo app nativa */}
        <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-700/60 dark:bg-surface-dark-card/95 sm:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          {MENU.map((m) => {
            const Icon = m.icon
            const activo = vista === m.k
            return (
              <button key={m.k} onClick={() => setVista(m.k)} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-semibold transition ${activo ? 'text-brand-navy dark:text-brand-gold' : 'text-slate-400'}`}>
                <span className={`grid h-8 w-12 place-items-center rounded-full transition ${activo ? 'bg-brand-navy/10 dark:bg-brand-gold/15' : ''}`}><Icon size={21} strokeWidth={1.9} /></span>
                {m.label}
              </button>
            )
          })}
        </nav>
        </>
      )}
    </div>
  )
}

function Foto({ url, size = 48, ringClass = '' }) {
  if (url) return <img src={url} alt="Foto de perfil" className={`flex-shrink-0 rounded-2xl object-cover ${ringClass}`} style={{ width: size, height: size }} />
  return (
    <div className={`grid flex-shrink-0 place-items-center rounded-2xl bg-brand-navy text-brand-gold ${ringClass}`} style={{ width: size, height: size }}>
      <Truck size={Math.round(size * 0.45)} strokeWidth={1.8} />
    </div>
  )
}

function Mini({ label, valor, color }) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/70 px-3 py-2 dark:border-slate-700/60 dark:bg-slate-800/40">
      <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-lg font-bold tabular-nums" style={color ? { color } : undefined}>{valor}</div>
    </div>
  )
}

function ReqItem({ ok, label }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      {ok ? <CheckCircle2 size={16} strokeWidth={2} className="text-emerald-500" /> : <Circle size={16} strokeWidth={1.8} className="text-slate-300 dark:text-slate-600" />}
      <span className={ok ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}>{label}</span>
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

function EstrellasBlancas({ n }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={13} strokeWidth={1.8} className={i <= n ? 'fill-brand-gold text-brand-gold' : 'text-white/30'} />
      ))}
    </span>
  )
}
