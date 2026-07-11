// Panel del DUEÑO para el enlace público de registro de choferes.
// Genera un TOKEN de empresa (settings.registroToken) + un PIN por chofer, muestra
// el enlace para compartir en el grupo, y una tabla con el PIN/estado de cada uno.
// Cuando el chofer envía su info por el enlace, su doc queda registroCompletado=true
// (desaparece del enlace) y aquí se ve como "Enviado".
import { useState, useEffect, useMemo } from 'react'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { Link2, Copy, Check, KeyRound, RefreshCw, ShieldCheck, ChevronDown } from 'lucide-react'
import { Card, Boton, Aviso, Badge, Input, Spinner } from './ui'

// Token de empresa: aleatorio, corto y compartible (va en la URL, no es secreto).
function nuevoToken() {
  const u = (crypto.randomUUID?.() || `${Math.random()}`).replace(/-/g, '')
  return u.slice(0, 24)
}
// PIN de 6 dígitos por chofer (esto sí es el secreto que confirma que es él).
function nuevoPin() {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return String(100000 + (a[0] % 900000))
}

export default function RegistroChoferes({ drivers, activeCompanyId, reloadDrivers }) {
  const [abierto, setAbierto] = useState(false)
  const [token, setToken] = useState('')
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [copiado, setCopiado] = useState('') // 'link' | driverId
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activeCompanyId) { setCargando(false); return }
    ;(async () => {
      try {
        const s = await getDoc(doc(db, 'settings', activeCompanyId))
        setToken(s.exists() ? (s.data().registroToken || '') : '')
      } catch { /* noop */ } finally { setCargando(false) }
    })()
  }, [activeCompanyId])

  const enlace = token ? `${window.location.origin}/registro/${token}` : ''

  const activos = useMemo(
    () => [...drivers].filter((d) => d.activo !== false).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '')),
    [drivers],
  )
  const pendientes = activos.filter((d) => !d.registroCompletado)

  const generarToken = async () => {
    if (!activeCompanyId) return
    setOcupado(true); setError('')
    try {
      const t = token || nuevoToken()
      await setDoc(doc(db, 'settings', activeCompanyId), { companyId: activeCompanyId, registroToken: t, registroTokenEn: serverTimestamp() }, { merge: true })
      setToken(t)
    } catch (e) { setError('No se pudo generar el enlace: ' + e.message) } finally { setOcupado(false) }
  }

  const generarPin = async (d) => {
    setOcupado(true); setError('')
    try {
      const pin = nuevoPin()
      await updateDoc(doc(db, 'drivers', d.id), { registroPin: pin })
      await reloadDrivers()
    } catch (e) { setError('No se pudo generar el PIN: ' + e.message) } finally { setOcupado(false) }
  }

  // Genera PIN a todos los pendientes que aún no tengan uno.
  const generarPinsFaltantes = async () => {
    const faltan = pendientes.filter((d) => !d.registroPin)
    if (faltan.length === 0) return
    setOcupado(true); setError('')
    try {
      for (const d of faltan) await updateDoc(doc(db, 'drivers', d.id), { registroPin: nuevoPin() })
      await reloadDrivers()
    } catch (e) { setError('Error al generar PINs: ' + e.message) } finally { setOcupado(false) }
  }

  const copiar = async (texto, cual) => {
    try { await navigator.clipboard.writeText(texto); setCopiado(cual); setTimeout(() => setCopiado((c) => (c === cual ? '' : c)), 1600) } catch { /* noop */ }
  }

  const nEnviados = activos.filter((d) => d.registroCompletado).length
  const nSinPin = pendientes.filter((d) => !d.registroPin).length

  return (
    <Card className="mb-4 overflow-hidden">
      <button onClick={() => setAbierto((v) => !v)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <Link2 size={17} strokeWidth={1.9} className="text-brand-gold" />
        <span className="text-base font-bold text-brand-navy dark:text-slate-100">Enlace de registro para choferes</span>
        <span className="ml-1 text-xs text-slate-400">Comparte un enlace y cada chofer completa su SSN, banco y W-9.</span>
        <div className="ml-auto flex items-center gap-2">
          {nEnviados > 0 && <Badge color="green">{nEnviados} enviado(s)</Badge>}
          <ChevronDown size={18} className={`text-slate-400 transition-transform ${abierto ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {abierto && (
        <div className="border-t border-slate-200 p-4 dark:border-slate-700/60">
          {error && <Aviso tipo="error">{error}</Aviso>}
          {cargando ? (
            <div className="flex items-center gap-2 py-4 text-sm text-slate-400"><Spinner className="text-brand-gold" /> Cargando…</div>
          ) : (
            <>
              {/* Enlace */}
              {!token ? (
                <div className="mb-4">
                  <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">
                    Crea un enlace único para tu empresa. Se lo mandas a tu grupo de choferes; cada uno se busca, pone su PIN y llena sus datos.
                  </p>
                  <Boton variant="gold" onClick={generarToken} disabled={ocupado}>{ocupado ? <><Spinner /> Creando…</> : <><Link2 size={15} strokeWidth={1.9} /> Crear enlace</>}</Boton>
                </div>
              ) : (
                <div className="mb-4">
                  <div className="mb-1 text-xs font-medium text-slate-500">Enlace para compartir en tu grupo</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input readOnly value={enlace} onFocus={(e) => e.target.select()} className="min-w-0 flex-1" />
                    <Boton variant="primary" onClick={() => copiar(enlace, 'link')}>{copiado === 'link' ? <><Check size={15} strokeWidth={2.2} /> Copiado</> : <><Copy size={15} strokeWidth={1.9} /> Copiar</>}</Boton>
                    <Boton variant="ghost" onClick={generarToken} disabled={ocupado} title="Genera un enlace nuevo (el anterior deja de funcionar)"><RefreshCw size={15} strokeWidth={1.9} /> Renovar</Boton>
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                    <ShieldCheck size={13} strokeWidth={1.9} /> Cada chofer necesita su PIN. Sin PIN, nadie puede ver ni enviar datos de otro.
                  </p>
                </div>
              )}

              {/* Lista de choferes con su PIN y estado */}
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">PIN por chofer</span>
                {nSinPin > 0 && (
                  <Boton variant="ghost" className="px-3 py-1.5 text-xs" onClick={generarPinsFaltantes} disabled={ocupado}>
                    <KeyRound size={14} strokeWidth={1.9} /> Generar PIN a {nSinPin} pendiente(s)
                  </Boton>
                )}
              </div>
              <div className="scroll-thin max-h-80 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      <th className="px-3 py-2 text-left font-semibold">Chofer</th>
                      <th className="px-3 py-2 text-left font-semibold">PIN</th>
                      <th className="px-3 py-2 text-center font-semibold">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activos.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-slate-400">Sin choferes activos.</td></tr>}
                    {activos.map((d) => (
                      <tr key={d.id} className="border-t border-slate-100 dark:border-slate-700/50">
                        <td className="px-3 py-2 font-medium text-brand-navy dark:text-slate-100">{d.nombre}</td>
                        <td className="px-3 py-2">
                          {d.registroCompletado ? (
                            <span className="text-slate-400">—</span>
                          ) : d.registroPin ? (
                            <button onClick={() => copiar(String(d.registroPin), d.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-sm tracking-widest text-brand-navy hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700">
                              {d.registroPin} {copiado === d.id ? <Check size={13} strokeWidth={2.4} className="text-emerald-600" /> : <Copy size={13} strokeWidth={1.9} className="text-slate-400" />}
                            </button>
                          ) : (
                            <Boton variant="ghost" className="px-2.5 py-1 text-xs" onClick={() => generarPin(d)} disabled={ocupado}>Generar PIN</Boton>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {d.registroCompletado ? <Badge color="green">Enviado ✓</Badge> : d.registroPin ? <Badge color="gold">Pendiente</Badge> : <Badge color="slate">Sin PIN</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-slate-400">
                Cuando un chofer envía su información, aparece como <b>Enviado</b>, su nombre desaparece del enlace y sus datos quedan en su perfil (solo tú los ves).
              </p>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
