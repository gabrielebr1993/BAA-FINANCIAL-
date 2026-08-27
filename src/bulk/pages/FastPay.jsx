// ============================================================================
// BULK · FAST PAY (panel del administrador)
//   · Configuración: porcentaje máximo, comisión, activo/inactivo, a quién aplica
//     (chofer / carrier) y MODO REAL (doble opt-in para operar con clave live).
//     Se guarda en bulk_settings/{tenantId}.fastPay; el backend la lee en cada
//     retiro (nada hardcodeado).
//   · Historial/auditoría: TODOS los retiros del tenant (quién, qué, cuánto,
//     cuándo, balance antes/después, usuario, estado, referencia). Los registros
//     son permanentes; el admin puede REVERTIR un retiro pagado (queda marcado,
//     nunca se borra).
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { Zap, Save, ShieldAlert, CheckCircle2, Clock, RotateCcw, AlertTriangle, Wallet, User, Truck } from 'lucide-react'
import { useColeccion, useDoc } from '../data/useColeccion'
import { crearConId } from '../data/repo'
import { auditar } from '../data/auditoria'
import { useBulkAuth } from '../BulkAuthContext'
import { authBulk } from '../firebaseBulk'
import { PageTitle, Card, Boton, Input, Badge, Aviso, Cargando, EstadoVacio, Spinner } from '../../components/ui'
import { money } from '../../utils/format'
import FiltroFechas, { enRangoFechas, RANGO_VACIO } from '../components/FiltroFechas'
import { useLang } from '../../i18n'

const DEFAULTS = { activo: true, porcentaje: 100, comisionPct: 3, chofer: true, carrier: true, modoReal: false }

const EST_RETIRO = {
  pagado: { l: 'Pagado', c: 'green' },
  procesando: { l: 'Procesando', c: 'gold' },
  error: { l: 'Error', c: 'red' },
  revertido: { l: 'Revertido', c: 'slate' },
}

function Toggle({ on, onChange, disabled }) {
  return (
    <button type="button" onClick={onChange} disabled={disabled}
      className={`relative h-6 w-11 flex-shrink-0 rounded-full transition ${on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'} ${disabled ? 'opacity-50' : ''}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  )
}

function FilaConfig({ titulo, sub, children }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 py-3 last:border-0 dark:border-slate-800">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-brand-navy dark:text-slate-100">{titulo}</div>
        {sub && <div className="text-xs text-slate-400">{sub}</div>}
      </div>
      {children}
    </div>
  )
}

export default function FastPay() {
  const { t } = useLang()
  const { tenantId, usuario, rol, puede } = useBulkAuth()
  const gestiona = puede('fastpay.gestionar')
  const { dato: settings, cargando } = useDoc('settings', tenantId)
  const { datos: retiros } = useColeccion('retiros')
  const [cfg, setCfg] = useState(DEFAULTS)
  const [msg, setMsg] = useState(null)
  const [guardando, setGuardando] = useState(false)
  const [porRevertir, setPorRevertir] = useState(null)
  const [revirtiendo, setRevirtiendo] = useState(false)
  const [fTipo, setFTipo] = useState('todos')
  const [rango, setRango] = useState(RANGO_VACIO) // filtro por fechas del historial

  // Carga la config guardada (con defaults para lo no configurado).
  useEffect(() => {
    if (settings?.fastPay) setCfg({ ...DEFAULTS, ...settings.fastPay })
  }, [settings?.fastPay])

  const set = (k, v) => setCfg((s) => ({ ...s, [k]: v }))

  const errores = useMemo(() => {
    const e = []
    const p = Number(cfg.porcentaje)
    if (!Number.isFinite(p) || p < 0) e.push(t('El porcentaje no puede ser negativo.'))
    if (p > 100) e.push(t('El porcentaje no puede ser mayor a 100%.'))
    const c = Number(cfg.comisionPct)
    if (!Number.isFinite(c) || c < 0 || c > 50) e.push(t('La comisión debe estar entre 0% y 50%.'))
    return e
  }, [cfg, t])

  const guardarCfg = async () => {
    if (errores.length) return
    setGuardando(true)
    try {
      const limpio = {
        activo: cfg.activo !== false,
        porcentaje: Math.min(100, Math.max(0, Number(cfg.porcentaje) || 0)),
        comisionPct: Math.min(50, Math.max(0, Number(cfg.comisionPct) || 0)),
        chofer: cfg.chofer !== false,
        carrier: cfg.carrier !== false,
        modoReal: cfg.modoReal === true,
      }
      await crearConId('settings', tenantId, tenantId, { fastPay: limpio })
      await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'fastpay_config', entidad: 'pago', detalle: `Fast Pay ${limpio.activo ? 'activo' : 'inactivo'} · ${limpio.porcentaje}% · comisión ${limpio.comisionPct}% · chofer:${limpio.chofer ? 'sí' : 'no'} carrier:${limpio.carrier ? 'sí' : 'no'} · modo ${limpio.modoReal ? 'REAL' : 'prueba'}` })
      setMsg({ tipo: 'ok', txt: t('Configuración de Fast Pay guardada.') })
    } catch (e) {
      setMsg({ tipo: 'error', txt: t('No se pudo guardar la configuración.') + ' ' + (e?.message || '') })
    } finally { setGuardando(false) }
  }

  const revertir = async (r) => {
    setRevirtiendo(true)
    try {
      const tok = await authBulk.currentUser.getIdToken()
      const resp = await fetch('/api/bulk-fastpay', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
        body: JSON.stringify({ accion: 'revertir', retiroId: r.id }),
      })
      const d = await resp.json().catch(() => ({}))
      if (!resp.ok || d.ok === false) throw new Error(d.error || t('Error de conexión.'))
      setMsg({ tipo: 'ok', txt: `${t('Retiro')} ${r.numero || r.id} ${t('revertido. El saldo vuelve a estar disponible.')}` })
      setPorRevertir(null)
    } catch (e) {
      setMsg({ tipo: 'error', txt: e?.message || t('No se pudo revertir.') })
    } finally { setRevirtiendo(false) }
  }

  const lista = useMemo(() => (retiros || [])
    .filter((r) => fTipo === 'todos' || (r.tipo || 'chofer') === fTipo)
    .filter((r) => enRangoFechas(r.ts, rango))
    .slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')), [retiros, fTipo, rango])

  const kpis = useMemo(() => {
    let pagado = 0, nPag = 0, nProc = 0, nRev = 0
    for (const r of retiros || []) {
      const e = r.estado || 'pagado'
      if (e === 'pagado') { pagado += Number(r.montoBase) || 0; nPag += 1 }
      else if (e === 'procesando') nProc += 1
      else if (e === 'revertido') nRev += 1
    }
    return { pagado, nPag, nProc, nRev }
  }, [retiros])

  if (cargando) return <Cargando />

  return (
    <div>
      <PageTitle>Fast Pay</PageTitle>
      <p className="-mt-3 mb-5 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
        {t('Adelanto instantáneo de ganancias para choferes y transportistas. Configura el porcentaje permitido y consulta el historial completo de retiros.')}
      </p>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="p-4"><div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Wallet size={13} className="text-emerald-500" /> {t('Total adelantado')}</div><div className="mt-1 text-2xl font-black text-emerald-600 dark:text-emerald-400">{money(kpis.pagado)}</div><div className="text-[11px] text-slate-400">{kpis.nPag} {t('retiros pagados')}</div></Card>
        <Card className="p-4"><div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Zap size={13} className="text-amber-500" /> {t('Porcentaje')}</div><div className="mt-1 text-2xl font-black text-brand-navy dark:text-slate-100">{Number(cfg.porcentaje) || 0}%</div><div className="text-[11px] text-slate-400">{t('del balance elegible')}</div></Card>
        <Card className="p-4"><div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Clock size={13} className="text-amber-500" /> {t('En proceso')}</div><div className="mt-1 text-2xl font-black text-brand-navy dark:text-slate-100">{kpis.nProc}</div></Card>
        <Card className="p-4"><div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><RotateCcw size={13} className="text-slate-400" /> {t('Revertidos')}</div><div className="mt-1 text-2xl font-black text-brand-navy dark:text-slate-100">{kpis.nRev}</div></Card>
      </div>

      {/* Configuración */}
      <Card className="mb-5 p-5">
        <h3 className="m-0 mb-1 flex items-center gap-2 text-base font-bold text-brand-navy dark:text-slate-100"><Zap size={17} className="text-amber-500" /> {t('Configuración')}</h3>
        <p className="m-0 mb-2 text-xs text-slate-400">{t('Ejemplo: con 50% y un balance elegible de $1,000, se puede adelantar hasta $500. El resto se paga por la vía normal.')}</p>

        <FilaConfig titulo={t('Fast Pay activo')} sub={t('Si lo apagas, nadie puede retirar (el historial se conserva).')}>
          <Toggle on={cfg.activo !== false} onChange={() => set('activo', !(cfg.activo !== false))} disabled={!gestiona} />
        </FilaConfig>
        <FilaConfig titulo={t('Porcentaje máximo de Fast Pay')} sub={t('Porcentaje del balance ganado que se puede adelantar (0–100).')}>
          <div className="flex items-center gap-1.5">
            <Input type="number" min="0" max="100" value={cfg.porcentaje} onChange={(e) => set('porcentaje', e.target.value)} disabled={!gestiona} className="h-10 w-24 text-right" />
            <span className="text-sm font-bold text-slate-400">%</span>
          </div>
        </FilaConfig>
        <FilaConfig titulo={t('Comisión por retiro')} sub={t('Se descuenta del monto adelantado.')}>
          <div className="flex items-center gap-1.5">
            <Input type="number" min="0" max="50" step="0.5" value={cfg.comisionPct} onChange={(e) => set('comisionPct', e.target.value)} disabled={!gestiona} className="h-10 w-24 text-right" />
            <span className="text-sm font-bold text-slate-400">%</span>
          </div>
        </FilaConfig>
        <FilaConfig titulo={t('Disponible para choferes (drivers)')}>
          <Toggle on={cfg.chofer !== false} onChange={() => set('chofer', !(cfg.chofer !== false))} disabled={!gestiona} />
        </FilaConfig>
        <FilaConfig titulo={t('Disponible para transportistas (carriers)')}>
          <Toggle on={cfg.carrier !== false} onChange={() => set('carrier', !(cfg.carrier !== false))} disabled={!gestiona} />
        </FilaConfig>
        <FilaConfig titulo={t('Modo REAL (producción)')} sub={t('Con la clave de PRUEBA de Stripe nunca se mueve dinero real. Para operar con dinero real necesitas la clave live en Vercel Y este interruptor encendido (doble candado).')}>
          <Toggle on={cfg.modoReal === true} onChange={() => set('modoReal', !(cfg.modoReal === true))} disabled={!gestiona} />
        </FilaConfig>
        {cfg.modoReal === true && (
          <div className="mt-2 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <ShieldAlert size={15} className="mt-0.5 flex-shrink-0" />
            <span>{t('Modo real encendido: si la clave de Stripe en Vercel es live (sk_live_), los retiros moverán DINERO REAL. Antes de activarlo, prueba balances, doble clic, refresh y reversos en modo prueba.')}</span>
          </div>
        )}

        {errores.map((e, i) => <p key={i} className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{e}</p>)}
        {gestiona && (
          <div className="mt-4">
            <Boton variant="gold" onClick={guardarCfg} disabled={guardando || errores.length > 0}><Save size={15} /> {guardando ? t('Guardando…') : t('Guardar configuración')}</Boton>
          </div>
        )}
      </Card>

      {/* Historial / auditoría */}
      <Card className="p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Historial de retiros')}</h3>
          <span className="text-sm text-slate-400">({lista.length})</span>
          <div className="ml-auto flex gap-1.5">
            {[{ k: 'todos', l: t('Todos') }, { k: 'chofer', l: t('Choferes') }, { k: 'carrier', l: t('Carriers') }].map((x) => (
              <button key={x.k} onClick={() => setFTipo(x.k)} className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${fTipo === x.k ? 'bg-brand-navy text-white dark:bg-amber-500 dark:text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'}`}>{x.l}</button>
            ))}
          </div>
        </div>
        <FiltroFechas rango={rango} onChange={setRango} className="mb-3" />
        {lista.length === 0 ? (
          <EstadoVacio titulo={t('Sin retiros todavía')} texto={t('Cuando un chofer o transportista use Fast Pay, cada operación quedará registrada aquí de forma permanente.')} mostrarBoton={false} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="px-2 py-2">ID</th><th className="px-2 py-2">{t('Quién')}</th><th className="px-2 py-2">{t('Fecha')}</th>
                  <th className="px-2 py-2 text-right">{t('Balance antes')}</th><th className="px-2 py-2 text-right">%</th>
                  <th className="px-2 py-2 text-right">{t('Monto')}</th><th className="px-2 py-2 text-right">{t('Comisión')}</th>
                  <th className="px-2 py-2 text-right">{t('Neto')}</th><th className="px-2 py-2 text-right">{t('Balance después')}</th>
                  <th className="px-2 py-2">{t('Usuario')}</th><th className="px-2 py-2">{t('Estado')}</th><th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => {
                  const e = EST_RETIRO[r.estado || 'pagado'] || EST_RETIRO.pagado
                  return (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-2">
                        <div className="font-mono text-xs font-bold text-brand-navy dark:text-slate-100">{r.numero || r.id.slice(0, 10)}</div>
                        {r.transferId && <div className="font-mono text-[10px] text-slate-400">{r.transferId}</div>}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
                          {(r.tipo || 'chofer') === 'carrier' ? <Truck size={13} className="text-amber-500" /> : <User size={13} className="text-emerald-500" />}
                          <span className="truncate">{r.nombre || r.choferNombre || '—'}</span>
                        </div>
                        <div className="text-[10px] uppercase text-slate-400">{(r.tipo || 'chofer') === 'carrier' ? t('Transportista') : t('Chofer')}</div>
                      </td>
                      <td className="px-2 py-2 text-xs text-slate-500">{String(r.ts || '').slice(0, 16).replace('T', ' ')}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">{r.disponibleAntes != null ? money(r.disponibleAntes) : '—'}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">{r.porcentaje != null ? `${r.porcentaje}%` : '—'}</td>
                      <td className="px-2 py-2 text-right font-bold tabular-nums text-brand-navy dark:text-slate-100">{money(r.montoBase)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-rose-500">−{money(r.comision)}</td>
                      <td className="px-2 py-2 text-right font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{money(r.neto)}</td>
                      <td className="px-2 py-2 text-right tabular-nums text-slate-500">{r.balanceDespues != null ? money(r.balanceDespues) : '—'}</td>
                      <td className="px-2 py-2 text-xs text-slate-500">{r.usuario || '—'}</td>
                      <td className="px-2 py-2">
                        <Badge color={e.c}>{t(e.l)}</Badge>
                        {r.estado === 'pagado' && (r.instant
                          ? <div className="mt-0.5 text-[9px] font-bold uppercase text-emerald-500">⚡ {t('instantáneo')}</div>
                          : r.instant === false && <div className="mt-0.5 text-[9px] font-semibold uppercase text-slate-400">{t('depósito 1–2 días')}</div>)}
                        {r.test && <div className="mt-0.5 text-[9px] font-bold uppercase text-amber-500">test</div>}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {gestiona && r.estado === 'pagado' && (
                          <button onClick={() => setPorRevertir(r)} title={t('Revertir retiro')} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:border-slate-700 dark:hover:bg-rose-500/10"><RotateCcw size={12} /> {t('Revertir')}</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Confirmación de reverso */}
      {porRevertir && (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-4" onClick={() => !revirtiendo && setPorRevertir(null)}>
          <Card className="w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400"><AlertTriangle size={18} /></span>
              <h3 className="m-0 text-lg font-bold text-brand-navy dark:text-slate-100">{t('Revertir retiro')}</h3>
            </div>
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">
              {t('Vas a revertir')} <b className="font-mono">{porRevertir.numero}</b> {t('de')} <b>{porRevertir.nombre}</b> ({money(porRevertir.montoBase)}). {t('Stripe devolverá la transferencia, el saldo volverá a estar disponible y el registro quedará marcado como revertido (no se borra).')}
            </p>
            <div className="flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setPorRevertir(null)} disabled={revirtiendo}>{t('Cancelar')}</Boton>
              <Boton variant="danger" onClick={() => revertir(porRevertir)} disabled={revirtiendo}>{revirtiendo ? <Spinner /> : <RotateCcw size={15} />} {t('Sí, revertir')}</Boton>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
