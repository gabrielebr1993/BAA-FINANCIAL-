// Página PÚBLICA de registro de choferes (sin login). El chofer: (1) se busca en
// la lista, (2) valida su PIN, (3) completa SSN/banco y firma su W-9. Al enviar,
// se guarda para la empresa y su nombre desaparece del enlace. Datos por token+PIN.
import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { Search, ShieldCheck, CheckCircle2, Loader2 } from 'lucide-react'
import { BANCOS_EEUU } from '../utils/bancos'
import { generarW9Base64, W9_OFICIAL_URL } from '../utils/w9'
import { Card, Input, Select, Boton, Aviso, Spinner } from '../components/ui'

const API = '/api/registro-publico'
async function call(accion, extra) {
  const resp = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accion, ...extra }) })
  return resp.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }))
}
const fmtSSN = (s) => { const d = String(s || '').replace(/\D/g, ''); return d.length === 9 ? `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}` : d }

function Campo({ label, children }) {
  return <div><div className="mb-1 text-xs font-medium text-slate-500">{label}</div>{children}</div>
}

export default function RegistroPublico() {
  const { token } = useParams()
  const [sp] = useSearchParams()
  const [paso, setPaso] = useState('cargando') // cargando | buscar | pin | form | listo | error
  const [empresa, setEmpresa] = useState('')
  const [pendientes, setPendientes] = useState([])
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(null) // {id, nombre}
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [f, setF] = useState({ nombreCompleto: '', direccion: '', ciudadEstadoZip: '', telefono: '', email: '', ssn: '', bancoNombre: '', tipoCuenta: 'checking', cuentaNumero: '', rutaNumero: '', certifica: false })
  const set = (k, v) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => {
    ;(async () => {
      const r = await call('lista', { token })
      if (!r.ok) { setError(r.error || 'Enlace no válido.'); setPaso('error'); return }
      setEmpresa(r.empresa || ''); setPendientes(r.pendientes || [])
      // Enlace personalizado (?d=driverId&pin=xxxx): auto-selecciona al chofer y
      // valida su PIN, para que caiga directo en el formulario sin buscarse.
      const dId = sp.get('d'); const pinQ = sp.get('pin')
      if (dId && pinQ) {
        const d = (r.pendientes || []).find((x) => x.id === dId)
        if (d) {
          setSel(d); setPin(pinQ)
          const v = await call('verificar', { token, driverId: dId, pin: String(pinQ).trim() })
          if (v.ok) {
            setF((s) => ({ ...s, nombreCompleto: v.driver.nombreCompleto || v.driver.nombre || d.nombre, direccion: v.driver.direccion || '', telefono: v.driver.telefono || '', email: v.driver.email || '' }))
            setPaso('form'); return
          }
          setPaso('pin'); return // PIN del enlace no válido → que lo escriba
        }
      }
      setPaso('buscar')
    })()
  }, [token])

  const filtrados = pendientes.filter((d) => d.nombre.toLowerCase().includes(q.trim().toLowerCase()))

  const validarPin = async () => {
    setError('')
    if (!pin.trim()) return setError('Escribe tu PIN.')
    const r = await call('verificar', { token, driverId: sel.id, pin: pin.trim() })
    if (!r.ok) return setError(r.error || 'PIN incorrecto.')
    setF((s) => ({ ...s, nombreCompleto: r.driver.nombreCompleto || r.driver.nombre || sel.nombre, direccion: r.driver.direccion || '', telefono: r.driver.telefono || '', email: r.driver.email || '' }))
    setPaso('form')
  }

  const enviar = async () => {
    setError('')
    if (String(f.ssn).replace(/\D/g, '').length !== 9) return setError('El SSN debe tener 9 dígitos.')
    if (String(f.rutaNumero).replace(/\D/g, '').length !== 9) return setError('El número de ruta (routing) debe tener 9 dígitos.')
    if (!f.cuentaNumero.trim()) return setError('Falta el número de cuenta.')
    if (!f.bancoNombre.trim()) return setError('Elige tu banco.')
    if (!f.certifica) return setError('Debes certificar que la información es correcta (W-9).')
    setEnviando(true)
    try {
      const ssn = String(f.ssn).replace(/\D/g, '')
      const w9Base64 = await generarW9Base64({
        nombre: f.nombreCompleto || sel.nombre, direccion: f.direccion, ciudadEstadoZip: f.ciudadEstadoZip,
        ssn, ssnFormateado: fmtSSN(ssn), firma: f.nombreCompleto || sel.nombre, fecha: new Date().toLocaleDateString(),
      })
      const r = await call('enviar', { token, driverId: sel.id, pin: pin.trim(), datos: { ...f, ssn }, w9Base64 })
      if (!r.ok) { setError(r.error || 'No se pudo enviar.'); return }
      setPaso('listo')
    } catch (e) { setError('Error: ' + e.message) } finally { setEnviando(false) }
  }

  return (
    <div className="min-h-screen bg-surface-light px-4 py-6 text-slate-800 dark:bg-surface-dark dark:text-slate-100">
      <div className="mx-auto max-w-lg">
        <div className="mb-4 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-navy text-lg font-extrabold text-brand-gold">M</div>
          <div>
            <div className="text-lg font-extrabold text-brand-navy dark:text-white">MilePay</div>
            <div className="text-xs text-slate-400">Registro de chofer{empresa ? ` · ${empresa}` : ''}</div>
          </div>
        </div>

        {paso === 'cargando' && <Card className="p-6"><div className="flex items-center gap-2 text-slate-500"><Spinner /> Cargando…</div></Card>}
        {paso === 'error' && <Card className="p-6"><Aviso tipo="error">{error}</Aviso></Card>}

        {paso === 'buscar' && (
          <Card className="p-5">
            <h2 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Busca tu nombre</h2>
            <p className="mb-3 text-sm text-slate-500">Selecciónate para continuar. Solo tú, con tu PIN, podrás enviar tu información.</p>
            <div className="relative mb-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input className="w-full pl-9" placeholder="Escribe tu nombre…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="scroll-thin max-h-72 space-y-1 overflow-y-auto">
              {filtrados.length === 0 ? <div className="py-4 text-center text-sm text-slate-400">Sin coincidencias. Si no apareces, contacta a tu empresa.</div> : filtrados.map((d) => (
                <button key={d.id} onClick={() => { setSel(d); setPin(''); setError(''); setPaso('pin') }} className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-2.5 text-left text-sm font-medium hover:border-brand-gold dark:border-slate-700">
                  {d.nombre} <span className="text-xs text-brand-gold">Soy yo →</span>
                </button>
              ))}
            </div>
          </Card>
        )}

        {paso === 'pin' && sel && (
          <Card className="p-5">
            <button onClick={() => setPaso('buscar')} className="mb-2 text-xs font-semibold text-slate-500 hover:text-brand-navy">← Volver</button>
            <h2 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Hola, {sel.nombre}</h2>
            <p className="mb-3 text-sm text-slate-500">Escribe el <b>PIN</b> que te dio tu empresa para confirmar que eres tú.</p>
            {error && <Aviso tipo="error">{error}</Aviso>}
            <div className="flex gap-2">
              <Input className="w-40 text-center text-lg tracking-widest" placeholder="••••••" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
              <Boton variant="gold" onClick={validarPin}>Continuar</Boton>
            </div>
          </Card>
        )}

        {paso === 'form' && sel && (
          <Card className="p-5">
            <h2 className="m-0 mb-1 text-base font-bold text-brand-navy dark:text-slate-100">Completa tu información</h2>
            <p className="mb-3 text-sm text-slate-500">Estos datos son privados: solo tu empresa los verá. Se usará para tu <b>W-9</b> y tu pago.</p>
            {error && <div className="mb-2"><Aviso tipo="error">{error}</Aviso></div>}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo label="Nombre completo (legal)"><Input value={f.nombreCompleto} onChange={(e) => set('nombreCompleto', e.target.value)} /></Campo>
              <Campo label="Teléfono"><Input value={f.telefono} onChange={(e) => set('telefono', e.target.value)} /></Campo>
              <Campo label="Dirección"><Input value={f.direccion} onChange={(e) => set('direccion', e.target.value)} /></Campo>
              <Campo label="Ciudad, estado, ZIP"><Input value={f.ciudadEstadoZip} onChange={(e) => set('ciudadEstadoZip', e.target.value)} /></Campo>
              <Campo label="Email"><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} /></Campo>
              <Campo label="Seguro Social (SSN, 9 dígitos)">
                <Input value={f.ssn} inputMode="numeric" onChange={(e) => set('ssn', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="123456789" />
              </Campo>
              <Campo label="Banco">
                <Input list="bancos-eeuu-pub" value={f.bancoNombre} onChange={(e) => set('bancoNombre', e.target.value)} placeholder="Escribe o elige…" />
                <datalist id="bancos-eeuu-pub">{BANCOS_EEUU.map((b) => <option key={b} value={b} />)}</datalist>
              </Campo>
              <Campo label="Tipo de cuenta">
                <Select value={f.tipoCuenta} onChange={(e) => set('tipoCuenta', e.target.value)}>
                  <option value="checking">Corriente (checking)</option>
                  <option value="savings">Ahorros (savings)</option>
                </Select>
              </Campo>
              <Campo label="Número de cuenta"><Input value={f.cuentaNumero} inputMode="numeric" onChange={(e) => set('cuentaNumero', e.target.value.replace(/\s/g, ''))} /></Campo>
              <Campo label="Número de ruta (routing, 9 dígitos)"><Input value={f.rutaNumero} inputMode="numeric" onChange={(e) => set('rutaNumero', e.target.value.replace(/\D/g, '').slice(0, 9))} placeholder="110000000" /></Campo>
            </div>
            <label className="mt-3 flex items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" className="mt-0.5" checked={f.certifica} onChange={(e) => set('certifica', e.target.checked)} />
              <span>Certifico (W-9) que la información es correcta, que mi número de identificación es correcto y que soy una persona de EE. UU. Mi nombre servirá como firma. Al enviar, se genera tu W-9 con estos datos.</span>
            </label>
            <p className="mt-2 text-xs text-slate-400">
              ¿Prefieres el formulario oficial? <a href={W9_OFICIAL_URL} target="_blank" rel="noreferrer" className="font-semibold text-brand-navy underline dark:text-brand-gold">Abre el W-9 del IRS</a> para verlo o llenarlo tú mismo.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setPaso('pin')} disabled={enviando}>Atrás</Boton>
              <Boton variant="gold" onClick={enviar} disabled={enviando}>{enviando ? <><Loader2 size={15} className="animate-spin" /> Enviando…</> : 'Enviar mi información'}</Boton>
            </div>
          </Card>
        )}

        {paso === 'listo' && (
          <Card className="p-6 text-center">
            <CheckCircle2 size={44} strokeWidth={1.6} className="mx-auto mb-2 text-emerald-500" />
            <h2 className="m-0 mb-1 text-lg font-bold text-brand-navy dark:text-slate-100">¡Listo, {sel?.nombre}!</h2>
            <p className="text-sm text-slate-500">Tu información y tu W-9 se enviaron a tu empresa y quedaron guardados. Ya no necesitas hacer nada más. Puedes cerrar esta página.</p>
          </Card>
        )}

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
          <ShieldCheck size={13} strokeWidth={1.8} /> Tus datos viajan cifrados y solo los ve tu empresa.
        </p>
      </div>
    </div>
  )
}
