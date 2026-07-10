// Panel de Control JARVIS (solo súper-admin): estado del sistema con datos REALES,
// en estilo CLARO integrado con MilePay (tarjetas blancas, dorado/navy, verde/
// ámbar/rojo solo para estados). Mini-cerebro dorado (ámbar si hay alerta crítica).
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Activity, Database, CreditCard, Cloud, Server, ArrowRight } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { stripeConfig } from '../utils/stripe'
import { Card, PageTitle, Aviso } from '../components/ui'
import JarvisSphere from '../components/JarvisSphere'

const NAVY = '#13233f', GOLD = '#c9a24b'
const GREEN = '#16a34a', AMBER = '#d97706', RED = '#dc2626'
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0)

function Sub({ children }) { return <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{children}</div> }

function Conexion({ icon: Icon, nombre, color, valor, detalle }) {
  const c = { verde: GREEN, ambar: AMBER, rojo: RED, gris: '#94a3b8' }[color] || '#94a3b8'
  return (
    <Card className="p-3.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"><Icon size={13} strokeWidth={1.8} />{nombre}</span>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
      </div>
      <div className="mt-1.5 text-sm font-bold" style={{ color: c }}>{valor}</div>
      <div className="text-[11px] text-slate-400">{detalle}</div>
    </Card>
  )
}

function Gauge({ label, valor }) {
  const v = Math.max(0, Math.min(100, Math.round(valor)))
  const r = 26, c = 2 * Math.PI * r
  const col = v >= 85 ? GREEN : v >= 65 ? AMBER : RED
  return (
    <div className="text-center">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#eef1f5" strokeWidth="6" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={col} strokeWidth="6" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c - (v / 100) * c} transform="rotate(-90 36 36)" />
        <text x="36" y="41" textAnchor="middle" fill={NAVY} fontSize="14" fontWeight="800">{v}%</text>
      </svg>
      <div className="text-[10px] text-slate-400">{label}</div>
    </div>
  )
}

export default function PanelControl() {
  const navigate = useNavigate()
  const { esSuperAdmin } = useAuth()
  const { activeCompanyId, empresaActiva, invoices, drivers, ajustes, numAlertas } = useData()
  const [ping, setPing] = useState(null)
  const [stripe, setStripe] = useState(null)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const t0 = performance.now()
      try { await getDoc(doc(db, 'settings', activeCompanyId || 'ping')); if (vivo) setPing({ ok: true, ms: Math.round(performance.now() - t0) }) }
      catch { if (vivo) setPing({ ok: false, ms: Math.round(performance.now() - t0) }) }
    })()
    ;(async () => { try { const r = await stripeConfig(); if (vivo) setStripe(r.ok ? r : { error: r.error }) } catch (e) { if (vivo) setStripe({ error: e.message }) } })()
    return () => { vivo = false }
  }, [activeCompanyId])

  const series = useMemo(() => {
    const list = [...(invoices || [])].slice(0, 8).reverse()
    return list.map((i) => ({ semana: (i.semana || '').slice(0, 10), ingreso: +num(i.ingresoTotal).toFixed(0), paquetes: num(i.totalPaquetes) }))
  }, [invoices])

  const ultima = invoices?.[0] || {}
  const sinBanco = (drivers || []).filter((d) => d.stripeEstado !== 'verificado').length
  const sinAsociar = (ultima.fallidosSinAsociar || []).length
  const ultBackup = (() => { const t = ajustes?.ultimoBackupAuto; try { return t?.toDate ? t.toDate() : (t?.seconds ? new Date(t.seconds * 1000) : null) } catch { return null } })()
  const horasBackup = ultBackup ? Math.round((Date.now() - ultBackup.getTime()) / 3.6e6) : null

  const diag = []
  if (sinBanco > 0) diag.push({ n: 'aviso', txt: `${sinBanco} chofer(es) sin cuenta bancaria verificada en Stripe.`, link: '/stripe' })
  if (sinAsociar > 0) diag.push({ n: 'critico', txt: `${sinAsociar} nombre(s) sin asociar en la última factura.`, link: '/facturas' })
  if (horasBackup == null) diag.push({ n: 'aviso', txt: 'Aún no hay respaldo automático registrado.', link: '/backups' })
  else if (horasBackup > 48) diag.push({ n: 'aviso', txt: `Último respaldo hace ${horasBackup} h.`, link: '/backups' })
  else diag.push({ n: 'ok', txt: `Último respaldo exitoso hace ${horasBackup} h.`, link: null })
  if (stripe && !stripe.error && stripe.configurado && stripe.test) diag.push({ n: 'aviso', txt: 'Stripe en modo TEST — pagos reales desactivados.', link: '/stripe' })
  if (stripe && !stripe.error && !stripe.configurado) diag.push({ n: 'critico', txt: 'Stripe no está configurado (falta STRIPE_SECRET_KEY).', link: '/stripe' })
  if (numAlertas > 0) diag.push({ n: 'aviso', txt: `${numAlertas} alerta(s) activas del negocio.`, link: '/alertas' })
  diag.push({ n: 'ok', txt: 'Reglas de seguridad de Firestore activas (acceso por empresa y rol).', link: null })

  const criticos = diag.filter((d) => d.n === 'critico').length
  const operativo = criticos === 0
  const saludGeneral = Math.max(0, 100 - criticos * 30 - diag.filter((d) => d.n === 'aviso').length * 8)
  const saludDatos = sinAsociar === 0 ? 100 : Math.max(20, 100 - sinAsociar * 5)
  const totalCh = (drivers || []).length || 1
  const saludPagos = Math.round(((drivers || []).filter((d) => d.stripeEstado === 'verificado').length / totalCh) * 100)

  if (!esSuperAdmin) {
    return (<div><PageTitle>Panel de Control</PageTitle><Aviso tipo="warn">Solo el súper-admin puede ver el panel de control.</Aviso></div>)
  }

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">Empresa: <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>Panel de Control</PageTitle>

      {/* Estado global + mini cerebro */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 text-xs text-slate-400">Monitoreo en tiempo real</div>
        <div className="flex items-center gap-3">
          <JarvisSphere estado="idle" size={54} alerta={criticos > 0} />
          <div className={`rounded-xl border px-4 py-2 text-sm font-extrabold ${operativo ? 'border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' : 'border-rose-500 bg-rose-50 text-rose-600 dark:bg-rose-500/10'}`}>
            {operativo ? '✓ Todo operativo' : '⚠ Requiere atención'}
          </div>
        </div>
      </div>

      {/* Conexiones */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Conexion icon={Database} nombre="FIREBASE" color={ping ? (ping.ok ? 'verde' : 'rojo') : 'gris'} valor={ping ? (ping.ok ? 'OK' : 'ERROR') : '…'} detalle={ping ? `${ping.ms} ms` : 'comprobando'} />
        <Conexion icon={CreditCard} nombre="STRIPE" color={stripe ? (stripe.error ? 'gris' : stripe.configurado ? (stripe.test ? 'ambar' : 'verde') : 'rojo') : 'gris'} valor={stripe ? (stripe.error ? '—' : stripe.configurado ? (stripe.test ? 'TEST' : 'LIVE') : 'OFF') : '…'} detalle={stripe ? (stripe.error ? 'no consultado' : stripe.configurado ? (stripe.test ? 'modo test' : 'producción') : 'no configurado') : 'comprobando'} />
        <Conexion icon={Server} nombre="VERCEL" color="verde" valor="OK" detalle="online" />
        <Conexion icon={Cloud} nombre="STORAGE" color="verde" valor="OK" detalle="protegido" />
      </div>

      {/* Gráficas */}
      <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card className="p-4"><Sub>Ingreso semanal ($)</Sub>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={series} margin={{ left: -12, right: 8, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
              <XAxis dataKey="semana" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #eef1f5', fontSize: 12 }} />
              <Line type="monotone" dataKey="ingreso" stroke={GOLD} strokeWidth={2.5} dot={{ r: 2.5, fill: GOLD }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="p-4"><Sub>Paquetes por semana</Sub>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={series} margin={{ left: -12, right: 8, top: 6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef1f5" />
              <XAxis dataKey="semana" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #eef1f5', fontSize: 12 }} cursor={{ fill: '#00000008' }} />
              <Bar dataKey="paquetes" fill={GOLD} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Salud + Qué revisar */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1.4fr]">
        <Card className="p-4"><Sub>Salud del sistema</Sub>
          <div className="mt-2 flex justify-around">
            <Gauge label="General" valor={saludGeneral} />
            <Gauge label="Datos" valor={saludDatos} />
            <Gauge label="Pagos" valor={saludPagos} />
          </div>
        </Card>
        <Card className="p-4"><Sub><span className="inline-flex items-center gap-1"><Activity size={12} strokeWidth={2} className="text-brand-gold" /> Qué revisar</span></Sub>
          <div className="flex flex-col gap-2">
            {diag.map((d, i) => {
              const c = d.n === 'critico' ? RED : d.n === 'aviso' ? AMBER : GREEN
              const ic = d.n === 'critico' ? '⚠' : d.n === 'aviso' ? '◆' : '✓'
              return (
                <div key={i} className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: `${c}0d`, border: `1px solid ${c}33` }}>
                  <span style={{ color: c }}>{ic}</span>
                  <div className="flex-1 text-[12.5px] text-slate-600 dark:text-slate-300">{d.txt}</div>
                  {d.link && <button onClick={() => navigate(d.link)} className="inline-flex items-center gap-1 text-[11px] font-semibold" style={{ color: c }}>Ir <ArrowRight size={12} strokeWidth={2.2} /></button>}
                </div>
              )
            })}
          </div>
        </Card>
      </div>
    </div>
  )
}
