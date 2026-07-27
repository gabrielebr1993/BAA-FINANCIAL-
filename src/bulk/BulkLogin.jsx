import { useState } from 'react'
import { Truck, ArrowLeft, MapPin, MessageSquare, FileCheck2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBulkAuth } from './BulkAuthContext'
import { Boton, Input, Aviso, Spinner } from '../components/ui'

export default function BulkLogin() {
  const { iniciarSesion, crearSuperAdmin, existeSuperAdmin } = useBulkAuth()
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
          <div><div className="text-2xl font-black text-white">Bulk</div><div className="text-xs text-slate-400">Transporte de materiales</div></div>
        </div>
        <div className="relative my-auto max-w-sm">
          <h2 className="text-3xl font-black leading-tight text-white">De la orden a la entrega, en una sola plataforma.</h2>
          <ul className="mt-6 space-y-3 text-slate-300">
            <li className="flex items-center gap-3"><MapPin size={18} className="text-amber-400" /> GPS en vivo y geocercas</li>
            <li className="flex items-center gap-3"><MessageSquare size={18} className="text-amber-400" /> Chat por orden en tiempo real</li>
            <li className="flex items-center gap-3"><FileCheck2 size={18} className="text-amber-400" /> Prueba de entrega con firma y foto</li>
          </ul>
        </div>
        <div className="relative text-xs text-slate-500">Módulo independiente — usuarios y datos separados de MyPay.</div>
      </div>

      {/* Formulario (derecha) */}
      <div className="flex flex-col justify-center p-6 sm:p-10">
        <div className="mx-auto w-full max-w-sm">
          <Link to="/elegir" className="mb-6 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft size={15} /> Cambiar de módulo</Link>
          <div className="mb-1 flex items-center gap-2 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-slate-900"><Truck size={20} /></div>
            <div className="text-xl font-black text-white">Bulk</div>
          </div>
          <h1 className="m-0 text-2xl font-extrabold text-white">{setup ? 'Crear administrador' : 'Bienvenido de vuelta'}</h1>
          <p className="mb-6 mt-1 text-sm text-slate-400">{setup ? 'Configura el primer super administrador.' : 'Inicia sesión para continuar.'}</p>

          {error && <Aviso tipo="error" className="mb-3">{error}</Aviso>}
          {!existeSuperAdmin && !setup && (
            <Aviso tipo="info" className="mb-3">No hay administrador aún. <button className="font-semibold underline" onClick={() => setModo('setup')}>Crear el primero</button>.</Aviso>
          )}

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

          {setup && <button onClick={() => setModo('login')} className="mt-4 w-full text-center text-sm text-slate-400 hover:text-slate-200">← Volver a iniciar sesión</button>}
        </div>
      </div>
    </div>
  )
}
