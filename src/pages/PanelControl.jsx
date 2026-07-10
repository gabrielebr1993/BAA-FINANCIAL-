// Panel de Control JARVIS (solo súper-admin): estado del sistema con datos REALES.
// Estética futurista con la marca (navy + dorado, neón sutil): estado global,
// conexiones con luces, gráficas de funcionamiento, medidores de salud y un
// panel de diagnóstico "Qué revisar" que detecta condiciones reales.
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { Activity, Database, CreditCard, Cloud, ShieldCheck, AlertTriangle, CheckCircle2, ArrowRight, Server } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { stripeConfig } from '../utils/stripe'
import { PageTitle, Aviso } from '../components/ui'
import JarvisSphere from '../components/JarvisSphere'

const NAVY = '#13233f'
const GOLD = '#c9a24b'
const num = (x) => (typeof x === 'number' && isFinite(x) ? x : 0)

function Luz({ color }) {
  const c = { verde: '#22c55e', ambar: '#f59e0b', rojo: '#ef4444', gris: '#64748b' }[color] || '#64748b'
  return <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 8px ${c}` }} />
}

function Conexion({ icon: Icon, nombre, color, detalle }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <Icon size={18} strokeWidth={1.7} className="text-brand-gold" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-100">{nombre}</div>
        <div className="truncate text-xs text-slate-400">{detalle}</div>
      </div>
      <Luz color={color} />
    </div>
  )
}

function Medidor({ label, valor }) {
  const v = Math.max(0, Math.min(100, Math.round(valor)))
  const col = v >= 75 ? '#22c55e' : v >= 50 ? GOLD : '#ef4444'
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-1 flex items-center justify-between text-xs text-slate-300"><span>{label}</span><span className="font-bold" style={{ color: col }}>{v}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${v}%`, background: col, boxShadow: `0 0 10px ${col}` }} /></div>
    </div>
  )
}

export default function PanelControl() {
  const navigate = useNavigate()
  const { esSuperAdmin } = useAuth()
  const { activeCompanyId, empresaActiva, invoices, drivers, ajustes, numAlertas } = useData()
  const [ping, setPing] = useState(null) // { ok, ms }
  const [stripe, setStripe] = useState(null) // { configurado, test } | { error }

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

  // Series semanales reales (más antiguas → más recientes).
  const series = useMemo(() => {
    const list = [...(invoices || [])].slice(0, 8).reverse()
    return list.map((i) => ({ semana: (i.semana || '').slice(0, 10), ingreso: +num(i.ingresoTotal).toFixed(0), paquetes: num(i.totalPaquetes) }))
  }, [invoices])

  // Diagnóstico real.
  const ultima = invoices?.[0] || {}
  const sinBanco = (drivers || []).filter((d) => d.stripeEstado !== 'verificado').length
  const sinAsociar = (ultima.fallidosSinAsociar || []).length
  const ultBackup = (() => { const t = ajustes?.ultimoBackupAuto; try { return t?.toDate ? t.toDate() : (t?.seconds ? new Date(t.seconds * 1000) : null) } catch { return null } })()
  const horasBackup = ultBackup ? Math.round((Date.now() - ultBackup.getTime()) / 3.6e6) : null

  const diag = []
  if (sinBanco > 0) diag.push({ nivel: 'aviso', txt: `${sinBanco} chofer(es) sin cuenta bancaria verificada en Stripe.`, link: '/stripe' })
  if (sinAsociar > 0) diag.push({ nivel: 'critico', txt: `${sinAsociar} nombre(s) sin asociar en la última factura.`, link: '/facturas' })
  if (horasBackup == null) diag.push({ nivel: 'aviso', txt: 'Aún no hay respaldo automático registrado.', link: '/backups' })
  else if (horasBackup > 48) diag.push({ nivel: 'aviso', txt: `Último respaldo hace ${horasBackup} h.`, link: '/backups' })
  if (stripe && !stripe.error && stripe.configurado && stripe.test) diag.push({ nivel: 'aviso', txt: 'Stripe en modo TEST (los pagos reales están deshabilitados).', link: '/stripe' })
  if (stripe && !stripe.error && !stripe.configurado) diag.push({ nivel: 'critico', txt: 'Stripe no está configurado (falta STRIPE_SECRET_KEY).', link: '/stripe' })
  if (numAlertas > 0) diag.push({ nivel: 'aviso', txt: `${numAlertas} alerta(s) activas del negocio.`, link: '/alertas' })
  diag.push({ nivel: 'ok', txt: 'Reglas de seguridad de Firestore activas (acceso por empresa y rol).', link: null })

  const criticos = diag.filter((d) => d.nivel === 'critico').length
  const operativo = criticos === 0
  const saludGeneral = Math.max(0, 100 - criticos * 30 - diag.filter((d) => d.nivel === 'aviso').length * 8)
  const saludDatos = sinAsociar === 0 ? 100 : Math.max(20, 100 - sinAsociar * 5)
  const totalCh = (drivers || []).length || 1
  const saludPagos = Math.round(((drivers || []).filter((d) => d.stripeEstado === 'verificado').length / totalCh) * 100)

  if (!esSuperAdmin) {
    return (<div><PageTitle>Panel de Control</PageTitle><Aviso tipo="warn">Solo el súper-admin puede ver el panel de control.</Aviso></div>)
  }

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">Empresa: <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>Panel de Control</PageTitle>

      {/* Marco futurista navy */}
      <div className="rounded-2xl border border-brand-gold/25 bg-[#0e1a30] p-4 sm:p-6" style={{ boxShadow: 'inset 0 0 60px rgba(201,162,75,0.06)' }}>
        {/* Estado global + mini esfera */}
        <div className="mb-5 flex flex-wrap items-center gap-4">
          <JarvisSphere estado="idle" size={72} alerta={criticos > 0} />
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-400">Estado del sistema</div>
            <div className={`text-2xl font-extrabold ${operativo ? 'text-emerald-400' : 'text-rose-400'}`}>{operativo ? 'TODO OPERATIVO' : 'REQUIERE ATENCIÓN'}</div>
          </div>
          <div className="ml-auto text-right text-xs text-slate-400">
            <div>Latencia Firebase: <b className="text-slate-200">{ping ? `${ping.ms} ms` : '…'}</b></div>
            <div>Semanas registradas: <b className="text-slate-200">{invoices?.length || 0}</b></div>
          </div>
        </div>

        {/* Conexiones */}
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Conexion icon={Database} nombre="Firebase" color={ping ? (ping.ok ? 'verde' : 'rojo') : 'gris'} detalle={ping ? (ping.ok ? `Conectado · ${ping.ms} ms` : 'Sin conexión') : 'Comprobando…'} />
          <Conexion icon={CreditCard} nombre="Stripe" color={stripe ? (stripe.error ? 'gris' : stripe.configurado ? (stripe.test ? 'ambar' : 'verde') : 'rojo') : 'gris'} detalle={stripe ? (stripe.error ? 'No consultado' : stripe.configurado ? (stripe.test ? 'Modo TEST' : 'Producción') : 'No configurado') : 'Comprobando…'} />
          <Conexion icon={Server} nombre="Vercel" color="verde" detalle="App en línea" />
          <Conexion icon={Cloud} nombre="Storage" color="verde" detalle="Protegido (reglas activas)" />
        </div>

        {/* Gráficas */}
        <div className="mb-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-200">Ingreso semanal ($)</div>
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={series} margin={{ left: -10, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                <XAxis dataKey="semana" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: NAVY, border: `1px solid ${GOLD}55`, borderRadius: 10, color: '#fff' }} />
                <Line type="monotone" dataKey="ingreso" stroke={GOLD} strokeWidth={2.5} dot={{ r: 2.5, fill: GOLD }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-sm font-semibold text-slate-200">Paquetes por semana</div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={series} margin={{ left: -10, right: 8, top: 6 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff12" />
                <XAxis dataKey="semana" tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: NAVY, border: `1px solid ${GOLD}55`, borderRadius: 10, color: '#fff' }} cursor={{ fill: '#ffffff0a' }} />
                <Bar dataKey="paquetes" fill="#3d5a80" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Medidores de salud */}
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Medidor label="Salud general" valor={saludGeneral} />
          <Medidor label="Salud de datos" valor={saludDatos} />
          <Medidor label="Salud de pagos" valor={saludPagos} />
        </div>

        {/* Diagnóstico */}
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-100"><Activity size={16} strokeWidth={1.9} className="text-brand-gold" /> Qué revisar</div>
          <div className="space-y-2">
            {diag.map((d, i) => {
              const Icon = d.nivel === 'critico' ? AlertTriangle : d.nivel === 'aviso' ? ShieldCheck : CheckCircle2
              const col = d.nivel === 'critico' ? 'text-rose-400' : d.nivel === 'aviso' ? 'text-amber-400' : 'text-emerald-400'
              return (
                <div key={i} className="flex items-center gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-200">
                  <Icon size={16} strokeWidth={1.9} className={col} />
                  <span className="flex-1">{d.txt}</span>
                  {d.link && <button onClick={() => navigate(d.link)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-gold hover:underline">Ir <ArrowRight size={13} strokeWidth={2} /></button>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
