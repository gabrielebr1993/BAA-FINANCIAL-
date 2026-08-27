// ============================================================================
// BULK · Modal de FAST PAY compartido (chofer y transportista/carrier).
// Habla con /api/bulk-fastpay (Stripe Connect). Flujo:
//   abrir → consulta estado/saldo real → configurar cuenta (si falta) →
//   elegir monto (hasta el % elegible) → confirmar → procesando → listo.
// Seguridad: cada intento de retiro lleva un opId único (idempotencia): doble
// clic, refresh o reintentos de red NUNCA generan dos transferencias.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Landmark, DollarSign, CheckCircle2, AlertTriangle, Zap } from 'lucide-react'
import { authBulk } from '../firebaseBulk'
import { Boton, Spinner } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const nuevoOpId = () => {
  try { return crypto.randomUUID().replace(/-/g, '') } catch { /* navegador viejo */ }
  return `op${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`
}
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

export default function FastPayModal({ abierto, onClose, nombre }) {
  const { t } = useLang()
  const [paso, setPaso] = useState('cargando') // cargando|config|inactivo|sinsaldo|monto|procesando|listo|error
  const [info, setInfo] = useState(null)
  const [monto, setMonto] = useState('')
  const [resultado, setResultado] = useState(null)
  const [err, setErr] = useState('')
  // opId de ESTE intento: se genera al entrar a la pantalla de monto y se conserva
  // durante los reintentos automáticos; un intento nuevo (tras error) genera otro.
  const opIdRef = useRef(nuevoOpId())
  const enviandoRef = useRef(false) // candado anti doble-clic síncrono

  const api = async (payload) => {
    const tok = await authBulk.currentUser.getIdToken()
    const r = await fetch('/api/bulk-fastpay', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(payload) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok || d.ok === false) throw new Error(d.error || t('Error de conexión.'))
    return d
  }

  useEffect(() => {
    if (!abierto) return
    setPaso('cargando'); setErr(''); setResultado(null); setMonto('')
    api({ accion: 'estado' })
      .then((d) => {
        setInfo(d)
        if (!d.activo || !d.aplicaRol) { setPaso('inactivo'); return }
        if (d.estado !== 'verificado') { setPaso('config'); return }
        if (!(d.elegible > 0)) { setPaso('sinsaldo'); return }
        opIdRef.current = nuevoOpId()
        setMonto(String(d.elegible))
        setPaso('monto')
      })
      .catch((e) => { setErr(e.message); setPaso('error') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto])

  const configurar = async () => {
    try { const d = await api({ accion: 'onboarding' }); window.open(d.url, '_blank', 'noopener') } catch (e) { setErr(e.message); setPaso('error') }
  }

  const montoN = r2(monto)
  const valido = info && montoN > 0 && montoN <= (info.elegible + 0.004)
  const comision = r2(montoN * ((info?.comisionPct || 0) / 100))
  const neto = r2(montoN - comision)

  const retirar = async () => {
    if (!valido || enviandoRef.current) return
    enviandoRef.current = true
    setPaso('procesando')
    try {
      const d = await api({ accion: 'retirar', monto: montoN, opId: opIdRef.current })
      setResultado(d); setPaso('listo')
    } catch (e) {
      setErr(e.message); setPaso('error')
      opIdRef.current = nuevoOpId() // el siguiente intento es una operación NUEVA
    } finally { enviandoRef.current = false }
  }

  const linea = (l, v, cls = '') => (
    <div className="flex items-center justify-between text-sm"><span className="text-slate-500 dark:text-slate-400">{l}</span><span className={`font-semibold ${cls || 'text-brand-navy dark:text-slate-100'}`}>{v}</span></div>
  )
  const pctTxt = useMemo(() => `${info?.porcentaje ?? 100}%`, [info])

  if (!abierto) return null
  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 sm:items-center" onClick={paso === 'procesando' ? undefined : onClose}>
      <div className="pb-safe w-full max-w-md rounded-t-2xl bg-white p-4 dark:bg-slate-900 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Zap size={16} /></span>
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">Fast Pay</h3>
          {paso !== 'procesando' && <button onClick={onClose} className="ml-auto rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X size={16} /></button>}
        </div>

        {paso === 'cargando' && (
          <div className="flex flex-col items-center py-6"><Spinner /><p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-300">{t('Consultando tu saldo…')}</p></div>
        )}

        {paso === 'inactivo' && (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800"><Zap size={26} /></div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">{t('Fast Pay no está disponible por ahora. El administrador lo tiene desactivado para tu perfil.')}</p>
            <Boton className="mt-4 w-full" onClick={onClose}>{t('Entendido')}</Boton>
          </div>
        )}

        {paso === 'config' && (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/15"><Landmark size={26} /></div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">
              {info?.estado === 'en_revision'
                ? t('Tu cuenta de cobro está en revisión. En cuanto Stripe la apruebe podrás retirar tu dinero.')
                : t('Para recibir tu dinero, primero configura tu cuenta de cobro (se hace una sola vez, con Stripe).')}
            </p>
            {info && <div className="mt-2 text-xs text-slate-400">{t('Saldo disponible')}: <b>{money(info.disponible)}</b> · {t('elegible')} ({pctTxt}): <b>{money(info.elegible)}</b></div>}
            {info?.estado !== 'en_revision' && <Boton className="mt-4 w-full" onClick={configurar}><Landmark size={16} /> {t('Configurar mi cuenta de cobro')}</Boton>}
            <button onClick={onClose} className="mt-2 w-full py-1 text-xs text-slate-400">{t('Cerrar')}</button>
          </div>
        )}

        {paso === 'sinsaldo' && (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800"><DollarSign size={28} /></div>
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-300">{t('No tienes saldo elegible para retirar en este momento.')}</p>
            {info && <div className="mt-2 text-xs text-slate-400">{t('Ganado')}: {money(info.ganado)} · {t('Ya retirado')}: {money(info.retirado)} · {t('Límite Fast Pay')}: {pctTxt}</div>}
            <Boton className="mt-4 w-full" onClick={onClose}>{t('Entendido')}</Boton>
          </div>
        )}

        {paso === 'monto' && info && (
          <div>
            {info.test && <div className="rounded-2xl bg-amber-50 px-3 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">{t('Modo prueba · no se mueve dinero real')}</div>}
            <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              {linea(t('Saldo disponible'), money(info.disponible))}
              {linea(`${t('Elegible Fast Pay')} (${pctTxt})`, money(info.elegible), 'text-amber-600 dark:text-amber-400')}
            </div>
            <label className="mt-3 block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('¿Cuánto quieres retirar?')}</span>
              <div className="mt-1 flex items-center gap-2">
                <div className="relative flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-black text-slate-400">$</span>
                  <input type="number" inputMode="decimal" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)}
                    className="h-12 w-full rounded-xl border border-slate-300 pl-7 pr-3 text-right text-xl font-black text-brand-navy outline-none focus:border-amber-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />
                </div>
                <button type="button" onClick={() => setMonto(String(info.elegible))} className="h-12 rounded-xl bg-slate-100 px-3 text-xs font-bold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">MAX</button>
              </div>
            </label>
            {!valido && montoN > 0 && <p className="mt-1 text-xs font-semibold text-rose-500">{t('El monto no puede superar tu elegible de')} {money(info.elegible)}.</p>}
            <div className="mt-3 space-y-2 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
              {linea(`${t('Comisión')} (${info.comisionPct}%)`, `− ${money(comision)}`, 'text-rose-500')}
              <div className="my-1 border-t border-dashed border-slate-200 dark:border-slate-700" />
              <div className="flex items-center justify-between"><span className="text-sm font-bold text-slate-700 dark:text-slate-200">{t('Recibes')}</span><span className="text-xl font-black text-[#15b66b]">{money(neto)}</span></div>
              <div className="text-right text-[11px] text-slate-400">{t('Saldo después del retiro')}: {money(r2(info.disponible - montoN))}</div>
            </div>
            <Boton className="mt-4 w-full" onClick={retirar} disabled={!valido}>{t('Confirmar retiro')} · {money(neto)}</Boton>
            <button onClick={onClose} className="mt-2 w-full py-1 text-xs text-slate-400">{t('Cancelar')}</button>
          </div>
        )}

        {paso === 'procesando' && (
          <div className="flex flex-col items-center py-6"><Spinner /><p className="mt-3 text-sm font-semibold text-slate-500 dark:text-slate-300">{t('Enviando tu dinero…')}</p><p className="mt-1 text-[11px] text-slate-400">{t('No cierres esta ventana.')}</p></div>
        )}

        {paso === 'listo' && (
          <div className="py-2 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#15b66b]/10 text-[#15b66b]"><CheckCircle2 size={40} /></div>
            <p className="mt-4 text-lg font-black text-brand-navy dark:text-slate-100">{t('¡En hora buena!')}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">{t('Tu dinero está en camino')}{nombre ? `, ${nombre}` : ''}.</p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#15b66b]/10 px-3 py-1 text-sm font-bold text-[#15b66b]">{money(resultado?.neto || 0)}</div>
            {resultado?.instant
              ? <div className="mx-auto mt-2 flex max-w-xs items-center justify-center gap-1.5 rounded-xl bg-[#15b66b]/10 px-3 py-2 text-xs font-bold text-[#15b66b]"><Zap size={14} /> {t('Enviado a tu tarjeta de débito · llega en ~30 minutos')}</div>
              : (
                <div className="mx-auto mt-2 max-w-xs rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  <b>{t('Va en depósito estándar a tu banco (1–2 días hábiles).')}</b>{' '}
                  {resultado?.instantMotivo === 'SIN_TARJETA'
                    ? t('Para cobrar en minutos, agrega una TARJETA DE DÉBITO como cuenta de cobro en tu panel de Stripe (te llegó el enlace por correo al registrarte).')
                    : t('El envío instantáneo no estuvo disponible esta vez; tu dinero llega igual por la vía normal.')}
                </div>
              )}
            <div className="mt-2 space-y-0.5 text-[11px] text-slate-400">
              {resultado?.numero && <div>{t('Operación')}: <span className="font-mono font-bold">{resultado.numero}</span></div>}
              {resultado?.transferId && <div>{t('Referencia')}: <span className="font-mono">{resultado.transferId}</span></div>}
              {resultado?.balanceDespues != null && <div>{t('Saldo restante')}: <b>{money(resultado.balanceDespues)}</b></div>}
            </div>
            <Boton className="mt-4 w-full" onClick={onClose}>{t('Listo')}</Boton>
          </div>
        )}

        {paso === 'error' && (
          <div className="text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-rose-100 text-rose-500 dark:bg-rose-500/15"><AlertTriangle size={26} /></div>
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{err || t('Algo salió mal. Intenta de nuevo.')}</p>
            <Boton className="mt-4 w-full" onClick={() => { setPaso('cargando'); setErr(''); api({ accion: 'estado' }).then((d) => { setInfo(d); if (d.estado !== 'verificado') setPaso('config'); else if (!(d.elegible > 0)) setPaso('sinsaldo'); else { opIdRef.current = nuevoOpId(); setMonto(String(d.elegible)); setPaso('monto') } }).catch((e) => { setErr(e.message); setPaso('error') }) }}>{t('Reintentar')}</Boton>
            <button onClick={onClose} className="mt-2 w-full py-1 text-xs text-slate-400">{t('Cerrar')}</button>
          </div>
        )}
      </div>
    </div>
  )
}
