// Modal de CANCELACIÓN de una orden (motivo con desplegable + texto libre si "Otro").
// Compartido por la lista de Órdenes y el detalle de orden.
import { useState } from 'react'
import { Ban } from 'lucide-react'
import { cancelarOrden, MOTIVOS_CANCELACION } from '../data/ordenAcciones'
import { Boton } from '../../components/ui'
import { useLang } from '../../i18n'

export default function ModalCancelarOrden({ orden, ctx, onClose, onDone }) {
  const { t } = useLang()
  const [motivo, setMotivo] = useState(MOTIVOS_CANCELACION[0])
  const [otro, setOtro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const confirmar = async () => {
    setOcupado(true)
    const m = motivo === 'Otro' ? (otro.trim() || 'Otro') : motivo
    try { await cancelarOrden(orden, { ...ctx, motivo: m }); onDone?.() }
    catch (e) { window.alert(`${t('No se pudo cancelar la orden.')}\n\n[${e?.code || 'error'}] ${e?.message || ''}`); setOcupado(false) }
  }
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2"><Ban size={18} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Cancelar orden')} {orden.numero}</h3></div>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{t('La orden quedará como “cancelada” y se conserva en el historial. Si tenía chofer, se le libera y notifica.')}</p>
        <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{t('Dinero: NO se le cobra al cliente y NO se paga al transportista ni al chofer — todos los montos de esta orden quedan en $0 (los anteriores se conservan como referencia en el historial).')}</p>
        <label className="mb-1 block text-xs font-semibold text-slate-500">{t('Motivo')}</label>
        <select value={motivo} onChange={(e) => setMotivo(e.target.value)} className="mb-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100">
          {MOTIVOS_CANCELACION.map((m) => <option key={m} value={m}>{t(m)}</option>)}
        </select>
        {motivo === 'Otro' && <input value={otro} onChange={(e) => setOtro(e.target.value)} placeholder={t('Especifica el motivo')} className="mb-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100" />}
        <div className="mt-3 flex justify-end gap-2">
          <Boton variant="ghost" onClick={onClose} disabled={ocupado} className="px-3 py-2 text-sm">{t('Volver')}</Boton>
          <Boton variant="danger" onClick={confirmar} disabled={ocupado} className="px-3 py-2 text-sm"><Ban size={15} /> {t('Confirmar cancelación')}</Boton>
        </div>
      </div>
    </div>
  )
}
