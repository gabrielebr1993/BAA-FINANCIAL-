// ============================================================================
// BULK · Enviar una FACTURA / AVISO DE PAGO por correo con identidad MilePay.
// Abre un mini-redactor con todo prellenado: De (dirección de facturación
// configurada), Para (contacto del cliente/transportista), asunto y cuerpo desde
// plantilla, el PDF del documento ADJUNTO automático y la firma corporativa.
// Envía vía la Cloud Function bulkGmailOp (Gmail API). Solo admin.
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { Mail, X, Paperclip, Send, PenLine } from 'lucide-react'
import { httpsCallable } from 'firebase/functions'
import { funcsBulk } from '../firebaseBulk'
import { useColeccion, useDoc } from '../data/useColeccion'
import { guardar } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { partesContacto } from '../domain/envio'
import { firmaHtmlDe, firmaTextoDe, cuerpoHtmlConFirma } from '../domain/correoFirma'
import { generarFacturaPDFBase64 } from '../data/facturaPDF'
import { money } from '../../utils/format'
import { Card, Boton, Input, Aviso, Spinner } from '../../components/ui'
import { useLang } from '../../i18n'

export default function EnviarFacturaEmail({ r, tipo = 'cliente', persona, empresa = 'Freight', onClose, onEnviado }) {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { dato: settings } = useDoc('settings', tenantId)
  const { datos: mailboxes } = useColeccion('mailboxes')

  const esCliente = tipo === 'cliente'
  const nombre = esCliente ? (r.clienteNombre || t('Cliente')) : (r.carrierNombre || t('Transportista'))
  const activos = useMemo(() => (mailboxes || []).filter((m) => m.estado !== 'suspendida'), [mailboxes])
  const buzones = useMemo(() => activos.filter((m) => m.tipo === 'buzon'), [activos])
  const dirFacturacion = settings?.correos?.facturacion || buzones[0]?.direccion || ''
  const firma = settings?.firmaCorreo || null
  const firmaLista = !!(firma && (firma.nombre || firma.empresa))

  const [de, setDe] = useState('')
  const [para, setPara] = useState('')
  const [asunto, setAsunto] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [incluirFirma, setIncluirFirma] = useState(true)
  const [ocupado, setOcupado] = useState(false)
  const [err, setErr] = useState(null)

  // Prellenado (cuando cargan settings/buzones): De, Para y plantilla del documento.
  useEffect(() => { if (!de && dirFacturacion) setDe(dirFacturacion) }, [dirFacturacion, de])
  useEffect(() => { setPara(partesContacto(persona?.contacto).email || '') }, [persona])
  useEffect(() => {
    setIncluirFirma(firma ? firma.activa !== false : true)
    // Desglose de viajes de la factura (máx. 12 líneas; el resto queda en el PDF).
    const lineas = r.lineas || []
    const desglose = lineas.slice(0, 12)
      .map((l) => `  • ${l.numero || '—'} · ${l.material || '—'} · ${l.ton || 0} ton · ${money(l.precio)}`)
      .join('\n')
    const masLineas = lineas.length > 12 ? `\n  … ${t('y')} ${lineas.length - 12} ${t('viajes más (ver PDF adjunto)')}` : ''
    const bloqueDetalle = lineas.length
      ? `\n\n${t('Detalle')} (${lineas.length} ${t('viajes')} · ${r.toneladas || 0} ton):\n${desglose}${masLineas}\n\n${t('TOTAL')}: ${money(r.total)}`
      : ''
    if (esCliente) {
      setAsunto(`${t('Factura')} ${r.numero} · ${empresa}`)
      setCuerpo(`${t('Estimado')} ${nombre}:\n\n${t('Adjuntamos la factura')} ${r.numero} ${t('por')} ${money(r.total)}, ${t('correspondiente al periodo')} ${r.desde || '—'} → ${r.hasta || '—'}.\n${t('Fecha de vencimiento')}: ${r.vence || '—'}.${bloqueDetalle}\n\n${t('Quedamos atentos a cualquier duda o aclaración.')}\n\n${t('Saludos cordiales,')}`)
    } else {
      setAsunto(`${t('Aviso de pago')} ${r.numero} · ${empresa}`)
      setCuerpo(`${t('Estimado')} ${nombre}:\n\n${t('Te informamos el pago de')} ${money(r.total)} ${t('por las cargas del periodo')} ${r.desde || '—'} → ${r.hasta || '—'}.\n${r.fechaPago ? `${t('Fecha de pago')}: ${r.fechaPago}.` : ''}${bloqueDetalle}\n\n${t('Adjuntamos el estado de cuenta. Cualquier aclaración, con gusto.')}`)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id])

  // La función de correo impersona BUZONES; si "De" es un alias, el buzón real es su destino.
  const buzonDe = (dir) => { const m = activos.find((x) => x.direccion === dir); return m?.tipo === 'alias' ? m.destino : dir }
  const conFirma = firmaLista && incluirFirma

  const enviar = async () => {
    setOcupado(true); setErr(null)
    try {
      const pdf = await generarFacturaPDFBase64(r, {
        empresa, titulo: esCliente ? 'FACTURA' : 'AVISO DE PAGO',
        paraLabel: esCliente ? t('Cliente') : t('Transportista'), para: nombre, clienteNombre: nombre,
      })
      const fn = httpsCallable(funcsBulk, 'bulkGmailOp')
      const res = await fn({
        op: 'enviar', buzon: buzonDe(de), de, para, asunto,
        cuerpo: conFirma ? `${cuerpo}\n\n${firmaTextoDe(firma, de)}` : cuerpo,
        ...(conFirma ? { cuerpoHtml: cuerpoHtmlConFirma(cuerpo, firma, de) } : {}),
        adjuntos: [{ nombre: pdf.nombre, tipo: 'application/pdf', datab64: pdf.datab64 }],
      })
      // Deja rastro en el documento (para saber que ya se envió por correo).
      try { await guardar(esCliente ? 'invoices' : 'carrierStatements', r.id, { enviadaPorCorreoEn: new Date().toISOString(), enviadaPorCorreoA: para }) } catch { /* noop */ }
      onEnviado && onEnviado(res?.data?.mensaje || t('Correo enviado.'))
      onClose()
    } catch (e) {
      setErr(e?.message || t('No se pudo enviar el correo.'))
    } finally { setOcupado(false) }
  }

  return (
    <div className="fixed inset-0 z-[85] grid place-items-center bg-black/50 p-3 sm:p-6" onClick={() => !ocupado && onClose()}>
      <Card className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ background: '#13233f' }}>
          <Mail size={17} className="text-amber-400" />
          <span className="truncate text-sm font-bold text-white">{esCliente ? t('Enviar factura por correo') : t('Enviar aviso de pago por correo')} · {r.numero}</span>
          <button onClick={() => !ocupado && onClose()} className="ml-auto rounded p-1 text-white/70 hover:bg-white/10 hover:text-white"><X size={15} /></button>
        </div>

        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {err && <Aviso tipo="error" className="mb-2">{err}</Aviso>}
          {buzones.length === 0 ? (
            <Aviso tipo="warn">{t('No hay buzones disponibles. Ve a “Correos del dominio”, pulsa Sincronizar y vuelve a intentar.')}</Aviso>
          ) : (
            <>
              <label className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm dark:border-slate-800">
                <span className="w-14 flex-shrink-0 text-xs text-slate-400">{t('De')}</span>
                <select value={de} onChange={(e) => setDe(e.target.value)} className="h-8 flex-1 rounded-md bg-transparent text-sm text-slate-700 outline-none dark:text-slate-200">
                  {activos.map((m) => <option key={m.id} value={m.direccion}>{m.direccion}{settings?.correos?.facturacion === m.direccion ? ` · ${t('facturación')}` : ''}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm dark:border-slate-800">
                <span className="w-14 flex-shrink-0 text-xs text-slate-400">{t('Para')}</span>
                <input value={para} onChange={(e) => setPara(e.target.value)} placeholder={t('correo del destinatario')} className="h-8 flex-1 bg-transparent text-sm text-slate-700 outline-none dark:text-slate-200" />
              </label>
              {!partesContacto(persona?.contacto).email && (
                <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{t('El contacto no tiene email registrado; escríbelo arriba (y agrégalo en su ficha para la próxima).')}</p>
              )}
              <label className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm dark:border-slate-800">
                <span className="w-14 flex-shrink-0 text-xs text-slate-400">{t('Asunto')}</span>
                <input value={asunto} onChange={(e) => setAsunto(e.target.value)} className="h-8 flex-1 bg-transparent text-sm font-semibold text-slate-800 outline-none dark:text-slate-100" />
              </label>
              <textarea value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} rows={9} className="mt-2 w-full resize-y bg-transparent text-sm text-slate-800 outline-none dark:text-slate-100" />

              {/* Adjunto automático */}
              <div className="mb-2 mt-1 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <Paperclip size={12} /> {r.numero || 'documento'}.pdf · {t('se adjunta automáticamente')}
                </span>
              </div>

              {conFirma && (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/40">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400"><PenLine size={11} /> {t('Firma corporativa (se añade al enviar)')}</div>
                  <div className="rounded-lg bg-white p-2 dark:bg-white" dangerouslySetInnerHTML={{ __html: firmaHtmlDe(firma, de).replace(/^<br><br>/, '') }} />
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3 dark:border-slate-800">
          <Boton variant="gold" onClick={enviar} disabled={ocupado || !de || !para.trim() || !asunto.trim() || buzones.length === 0} className="px-5">
            {ocupado ? <Spinner /> : <Send size={15} />} {t('Enviar')}
          </Boton>
          {firmaLista && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800">
              <input type="checkbox" checked={incluirFirma} onChange={(e) => setIncluirFirma(e.target.checked)} className="accent-amber-500" /> {t('Firma')}
            </label>
          )}
          <Boton variant="ghost" onClick={onClose} disabled={ocupado} className="ml-auto">{t('Cancelar')}</Boton>
        </div>
      </Card>
    </div>
  )
}
