import { useState } from 'react'
import { Truck, ArrowLeft, MapPin, MessageSquare, FileCheck2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBulkAuth } from './BulkAuthContext'
import { Boton, Input, Aviso, Spinner } from '../components/ui'

export default function BulkLogin() {
  const { iniciarSesion, crearSuperAdmin } = useBulkAuth()
  const [modo, setModo] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', nombre: '', empresa: '' })
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const setup = modo === 'setup'

  const enviar = async (e) => {
    e.preventDefault(); setError(''); setOcupado(true)
    try {
      if (setup) await crearSuperAdmin(form)
      else await iniciarSesion(form.email, form.password)
    } catch (err) { setError(err.message) } finally { setOcupado(false) }
  }

  return (
    <div className="grid min-h-screen bg-slate-950 lg:grid-cols-2">
      {/* Panel de marca (izquierda, solo desktop) */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-slate-900 via-brand-navy to-slate-950 p-10 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -right-24 top-1/3 h-80 w-80 rounded-full bg-amber-500/20 blur-[100px]" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-amber-500 text-slate-900"><Truck size={24} strokeWidth={2} /></div>
          <div><div className="text-2xl font-black text-white">Freight</div><div className="text-xs text-slate-400">Transporte de materiales</div></div>
        </div>
        <div className="relative my-auto max-w-sm">
          <h2 className="text-3xl font-black leading-tight text-white">De la orden a la entrega, en una sola plataforma.</h2>
          <ul className="mt-6 space-y-3 text-slate-300">
            <li className="flex items-center gap-3"><MapPin size={18} className="text-amber-400" /> GPS en vivo y geocercas</li>
            <li className="flex items-center gap-3"><MessageSquare size={18} className="text-amber-400" /> Chat por orden en tiempo real</li>
            <li className="flex items-center gap-3"><FileCheck2 size={18} className="text-amber-400" /> Prueba de entrega con firma y foto</li>
          </ul>

          {/* Ruta viva: un envío recorriendo sus hitos, de planta a destino */}
          <div className="mt-9">
            <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-400/80">
              <span>Planta</span><span>En ruta</span><span>Destino</span>
            </div>
            <div className="fr-route relative h-12 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
              <div className="fr-road" aria-hidden="true" />
              <span className="fr-pin" style={{ left: '8%' }} aria-hidden="true" />
              <span className="fr-pin" style={{ left: '50%' }} aria-hidden="true" />
              <span className="fr-pin" style={{ left: '92%' }} aria-hidden="true" />
              <div className="fr-truck" aria-hidden="true"><Truck size={22} strokeWidth={2} /></div>
            </div>
          </div>
        </div>
        <div className="relative text-xs text-slate-500">Módulo independiente — usuarios y datos separados de MyPay.</div>

        <style>{`
          .fr-road { position:absolute; left:0; right:0; bottom:14px; height:2px;
            background:repeating-linear-gradient(90deg, rgba(245,158,11,.55) 0 14px, transparent 14px 28px);
            animation: fr-flow .7s linear infinite; }
          .fr-pin { position:absolute; bottom:11px; width:8px; height:8px; margin-left:-4px; border-radius:9999px;
            background:#f59e0b; box-shadow:0 0 0 3px rgba(245,158,11,.18); animation: fr-pulse 2.4s ease-in-out infinite; }
          .fr-truck { position:absolute; bottom:16px; color:#fff; filter:drop-shadow(0 2px 4px rgba(0,0,0,.4));
            animation: fr-drive 6.5s cubic-bezier(.5,0,.5,1) infinite, fr-bob .6s ease-in-out infinite; }
          @keyframes fr-flow { to { background-position-x:-28px; } }
          @keyframes fr-drive { 0% { left:-10%; opacity:0; } 8% { opacity:1; } 92% { opacity:1; } 100% { left:100%; opacity:0; } }
          @keyframes fr-bob { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-1.5px); } }
          @keyframes fr-pulse { 0%,100% { box-shadow:0 0 0 3px rgba(245,158,11,.18); } 50% { box-shadow:0 0 0 5px rgba(245,158,11,.06); } }
          @media (prefers-reduced-motion: reduce) {
            .fr-road, .fr-truck, .fr-pin { animation:none; }
            .fr-truck { left:50%; }
          }
        `}</style>
      </div>

      {/* Formulario (derecha) */}
      <div className="flex flex-col justify-center p-6 sm:p-10">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/elegir" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft size={15} /> Cambiar de módulo</Link>
          <div className="mb-1 flex items-center gap-2 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-slate-900"><Truck size={20} /></div>
            <div className="text-xl font-black text-white">Freight</div>
          </div>
          {/* Ruta viva (compacta) — visible en móvil/vertical, donde el panel de marca se oculta */}
          <div className="fr-route relative mb-5 h-10 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] lg:hidden">
            <div className="fr-road" aria-hidden="true" />
            <span className="fr-pin" style={{ left: '8%' }} aria-hidden="true" />
            <span className="fr-pin" style={{ left: '50%' }} aria-hidden="true" />
            <span className="fr-pin" style={{ left: '92%' }} aria-hidden="true" />
            <div className="fr-truck" aria-hidden="true"><Truck size={19} strokeWidth={2} /></div>
          </div>
          <h1 className="m-0 text-2xl font-extrabold text-white">{setup ? 'Crear administrador' : 'Bienvenido de vuelta'}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-400">{setup ? 'Configura el primer super administrador.' : 'Inicia sesión para continuar.'}</p>

          {error && <Aviso tipo="error" className="mb-3">{error}</Aviso>}

          <form onSubmit={enviar} className="space-y-3">
            {setup && <Input placeholder="Tu nombre" value={form.nombre} onChange={set('nombre')} required />}
            {setup && <Input placeholder="Nombre de la empresa" value={form.empresa} onChange={set('empresa')} />}
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Correo</label>
              <Input type="email" placeholder="tucorreo@empresa.com" value={form.email} onChange={set('email')} required />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Contraseña</label>
              <Input type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required />
            </div>
            <Boton type="submit" variant="gold" disabled={ocupado} className="w-full justify-center py-2.5 text-base">
              {ocupado ? <><Spinner /> Procesando…</> : setup ? 'Crear super administrador' : 'Iniciar sesión'}
            </Boton>
          </form>

          {setup
            ? <button onClick={() => setModo('login')} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-200">← Volver a iniciar sesión</button>
            : <button onClick={() => setModo('setup')} className="mt-4 w-full text-center text-xs text-slate-500 hover:text-slate-300">¿Primer arranque? Crear administrador</button>}
        </div>
      </div>
    </div>
  )
}
