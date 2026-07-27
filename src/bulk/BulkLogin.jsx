import { useState } from 'react'
import { Truck, ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useBulkAuth } from './BulkAuthContext'
import { Card, Boton, Input, Aviso, Spinner } from '../components/ui'

export default function BulkLogin() {
  const { iniciarSesion, crearSuperAdmin, existeSuperAdmin } = useBulkAuth()
  const [modo, setModo] = useState('login') // 'login' | 'setup'
  const [form, setForm] = useState({ email: '', password: '', nombre: '', empresa: '' })
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const enviar = async (e) => {
    e.preventDefault()
    setError(''); setOcupado(true)
    try {
      if (modo === 'setup') await crearSuperAdmin(form)
      else await iniciarSesion(form.email, form.password)
    } catch (err) { setError(err.message) } finally { setOcupado(false) }
  }

  const setup = modo === 'setup'
  return (
    <div className="grid min-h-screen place-items-center bg-slate-950 p-4">
      <div className="w-full max-w-md">
        <Link to="/elegir" className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"><ArrowLeft size={15} /> Volver</Link>
        <Card className="p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-500 text-slate-900"><Truck size={22} strokeWidth={2} /></div>
            <div>
              <h1 className="m-0 text-xl font-extrabold text-brand-navy dark:text-slate-100">Bulk</h1>
              <p className="m-0 text-xs text-slate-400">Plataforma de transporte de materiales</p>
            </div>
          </div>

          {error && <Aviso tipo="error" className="mb-3">{error}</Aviso>}
          {!existeSuperAdmin && !setup && (
            <Aviso tipo="info" className="mb-3">No hay administrador aún. <button className="font-semibold underline" onClick={() => setModo('setup')}>Crear el primero</button>.</Aviso>
          )}

          <form onSubmit={enviar} className="space-y-3">
            {setup && <Input placeholder="Tu nombre" value={form.nombre} onChange={set('nombre')} required />}
            {setup && <Input placeholder="Nombre de la empresa" value={form.empresa} onChange={set('empresa')} />}
            <Input type="email" placeholder="Correo" value={form.email} onChange={set('email')} required />
            <Input type="password" placeholder="Contraseña" value={form.password} onChange={set('password')} required />
            <Boton type="submit" variant="gold" disabled={ocupado} className="w-full justify-center py-2.5">
              {ocupado ? <><Spinner /> Procesando…</> : setup ? 'Crear Super Administrador' : 'Entrar'}
            </Boton>
          </form>

          {existeSuperAdmin && (
            <p className="mt-4 text-center text-xs text-slate-400">
              Módulo independiente — usuarios y datos separados de MyPay.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
