// Botón reutilizable "Imprimir ticket" (carga / entrega) para CUALQUIER perfil.
// Respeta roles y reglas:
//   · STAFF (canGenerar): genera el número correlativo (bulk_counters es solo-staff),
//     lo guarda en la orden junto a un SNAPSHOT de los datos resueltos (para reimprimir
//     igual) y audita.
//   · NO-STAFF (chofer/cliente/transportista): NO escribe contadores ni la orden; abre
//     el ticket con el número YA generado (o el número de orden como respaldo) desde el
//     snapshot guardado. Registra en auditoría (permitido a cualquier miembro).
import { useState } from 'react'
import { Printer, Package, CheckCircle2, X } from 'lucide-react'
import { guardar, siguienteSecuencia } from '../data/repo'
import { auditar } from '../data/auditoria'
import { datosTicket } from '../domain/documentos'
import TicketOrden from './TicketOrden'
import { useLang } from '../../i18n'

export default function ImprimirTicket({
  orden, empresa = 'Freight', jobsMap = {}, plantasMap = {}, carriersMap = {}, materialesMap = {}, clientesMap = {}, ordenesJob = null,
  canGenerar = false, tenantId, usuario, rol, compacto = false, className = '',
}) {
  const { t } = useLang()
  const [menu, setMenu] = useState(false)
  const [datos, setDatos] = useState(null)

  const abrir = async (evt) => {
    setMenu(false)
    const campo = evt === 'Loaded' ? 'ticketCarga' : 'ticketEntrega'
    const snapCampo = evt === 'Loaded' ? 'ticketDatosCarga' : 'ticketDatosEntrega'
    let num = orden[campo] || ''
    if (canGenerar && !num) {
      try {
        const seq = await siguienteSecuencia(tenantId, campo)
        num = `${evt === 'Loaded' ? 'TC' : 'TE'}-${String(seq).padStart(6, '0')}`
        const snap = { ...datosTicket(orden, evt, { jobsMap, plantasMap, carriersMap, materialesMap, clientesMap, ordenesJob }), ticketNumber: num }
        await guardar('orders', orden.id, { [campo]: num, [snapCampo]: snap })
        auditar(tenantId, { usuario: usuario?.email, rol, accion: 'generar_ticket', entidad: 'orden', detalle: `${num} · ${orden.numero} · ${evt}` })
        setDatos(snap); return
      } catch { /* sin permiso de contador: cae al respaldo de abajo */ }
    } else {
      auditar(tenantId, { usuario: usuario?.email, rol, accion: 'imprimir_ticket', entidad: 'orden', detalle: `${num || orden.numero} · ${evt}` })
    }
    // Snapshot guardado (reimpresión idéntica) o cálculo en vivo con lo que haya.
    const base = orden[snapCampo] || datosTicket(orden, evt, { jobsMap, plantasMap, carriersMap, materialesMap, clientesMap, ordenesJob })
    setDatos({ ...base, event: evt, ticketNumber: num || base.ticketNumber || orden.numero })
  }

  const btn = compacto
    ? <button onClick={(e) => { e.stopPropagation(); setMenu(true) }} title={t('Imprimir ticket')} className={`grid h-8 w-8 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-brand-navy dark:hover:bg-slate-700 ${className}`}><Printer size={15} /></button>
    : <button onClick={(e) => { e.stopPropagation(); setMenu(true) }} className={`inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-brand-navy transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 ${className}`}><Printer size={14} /> {t('Imprimir ticket')}</button>

  return (
    <>
      {btn}
      {menu && (
        <div className="fixed inset-0 z-[75] grid place-items-center bg-black/50 p-4" onClick={(e) => { e.stopPropagation(); setMenu(false) }}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400"><Printer size={16} /></span>
              <h3 className="m-0 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Imprimir ticket')} · {orden.numero}</h3>
              <button onClick={() => setMenu(false)} className="ml-auto text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <button onClick={() => abrir('Loaded')} className="mb-2 flex w-full items-center gap-2 rounded-xl border border-slate-200 p-3 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-slate-700 dark:hover:bg-emerald-500/10">
              <Package size={18} className="text-emerald-500" />
              <div><div className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Ticket de carga')}</div><div className="text-[11px] text-slate-400">Loaded · {orden.ticketCarga || t('se generará')}</div></div>
            </button>
            <button onClick={() => abrir('Received')} className="flex w-full items-center gap-2 rounded-xl border border-slate-200 p-3 text-left transition hover:border-brand-gold/50 hover:bg-amber-50/40 dark:border-slate-700 dark:hover:bg-amber-500/10">
              <CheckCircle2 size={18} className="text-brand-navy dark:text-amber-400" />
              <div><div className="text-sm font-bold text-brand-navy dark:text-slate-100">{t('Ticket de entrega')}</div><div className="text-[11px] text-slate-400">Received · {orden.ticketEntrega || t('se generará')}</div></div>
            </button>
          </div>
        </div>
      )}
      {datos && <TicketOrden datos={datos} empresa={empresa} onClose={() => setDatos(null)} />}
    </>
  )
}
