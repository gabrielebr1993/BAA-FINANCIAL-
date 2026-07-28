import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, LogOut, Grid2x2, Weight, DollarSign, ClipboardList, FileText, Download, PenLine } from 'lucide-react'
import { useBulkAuth } from '../BulkAuthContext'
import { useColeccion } from '../data/useColeccion'
import { where, guardar } from '../data/repo'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { generarFacturaPDF } from '../data/facturaPDF'
import FirmaPad from '../components/FirmaPad'
import { Card, KPI, Badge, Boton, Cargando, EstadoVacio, Tabla } from '../../components/ui'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const ENTREGADAS = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const n = (v) => Number(v) || 0
const fechaEntrega = (o) => o?.hitos?.entrega ? new Date(o.hitos.entrega) : null

export default function ClientePortal() {
  const { t } = useLang()
  const { usuario, cerrarSesion } = useBulkAuth()
  const navigate = useNavigate()
  const clienteId = usuario?.clienteId || '__none__'
  const { datos: ordenes, cargando } = useColeccion('orders', [where('clienteId', '==', clienteId)])
  const { datos: facturas } = useColeccion('invoices', [where('clienteId', '==', clienteId)])
  const [firmando, setFirmando] = useState(null) // factura en firma
  const [firma, setFirma] = useState(null)

  const stats = useMemo(() => {
    const entregadas = ordenes.filter((o) => ENTREGADAS.includes(o.estado))
    const ton = entregadas.reduce((a, o) => a + n(o.pesoReal ?? o.pesoEstimado), 0)
    const gasto = entregadas.reduce((a, o) => a + n(o.precioCliente), 0)
    const hoy = new Date(); const d0 = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())
    const semana = new Date(d0); semana.setDate(d0.getDate() - d0.getDay())
    const mes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
    const enRango = (o, desde) => { const f = fechaEntrega(o); return f && f >= desde }
    const sum = (arr) => arr.reduce((a, o) => a + n(o.precioCliente), 0)
    const porMaterial = {}
    for (const o of entregadas) { const m = o.material || '—'; porMaterial[m] = porMaterial[m] || { material: m, ton: 0, gasto: 0 }; porMaterial[m].ton += n(o.pesoReal ?? o.pesoEstimado); porMaterial[m].gasto += n(o.precioCliente) }
    return {
      total: ordenes.length, entregadas: entregadas.length, ton, gasto,
      hoy: sum(entregadas.filter((o) => enRango(o, d0))),
      semana: sum(entregadas.filter((o) => enRango(o, semana))),
      mes: sum(entregadas.filter((o) => enRango(o, mes))),
      porMaterial: Object.values(porMaterial).sort((a, b) => b.gasto - a.gasto),
    }
  }, [ordenes])

  const firmarFactura = async () => {
    if (!firma || !firmando) return
    const datos = { estado: 'firmada', firma, firmante: usuario?.nombre || usuario?.email, firmadaEn: new Date().toISOString() }
    await guardar('invoices', firmando.id, datos)
    generarFacturaPDF({ ...firmando, ...datos }, { clienteNombre: firmando.clienteNombre, empresa: 'Freight' })
    setFirmando(null); setFirma(null)
  }

  if (cargando) return <div className="grid min-h-screen place-items-center"><Cargando /></div>

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <header className="flex items-center gap-2 bg-slate-900 px-4 py-3 text-white">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-500 text-slate-900"><Building2 size={18} /></div>
        <div><div className="text-sm font-bold">{usuario?.nombre}</div><div className="text-[11px] text-slate-400">{t('Portal del cliente')}</div></div>
        <button onClick={() => navigate('/elegir')} className="ml-auto rounded-lg p-2 text-slate-300 hover:bg-white/10"><Grid2x2 size={18} /></button>
        <button onClick={cerrarSesion} className="rounded-lg p-2 text-rose-300 hover:bg-white/10"><LogOut size={18} /></button>
      </header>

      <main className="mx-auto max-w-5xl p-4">
        {!usuario?.clienteId ? <EstadoVacio titulo={t('Cuenta no vinculada')} texto={t('Tu usuario aún no está ligado a un cliente. Pídele al administrador que lo asigne.')} mostrarBoton={false} /> : (
          <>
            <div className="mb-4 flex flex-wrap gap-3">
              <KPI label={t('Órdenes')} value={stats.total} icon={ClipboardList} accent="navy" />
              <KPI label={t('Entregadas')} value={stats.entregadas} icon={ClipboardList} accent="green" />
              <KPI label={t('Toneladas entregadas')} value={Math.round(stats.ton)} icon={Weight} accent="gold" />
              <KPI label={t('Gasto total')} value={money(stats.gasto)} icon={DollarSign} accent="blue" />
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <Card className="p-4"><div className="text-xs text-slate-400">{t('Gasto hoy')}</div><div className="text-xl font-bold text-brand-navy dark:text-slate-100">{money(stats.hoy)}</div></Card>
              <Card className="p-4"><div className="text-xs text-slate-400">{t('Gasto esta semana')}</div><div className="text-xl font-bold text-brand-navy dark:text-slate-100">{money(stats.semana)}</div></Card>
              <Card className="p-4"><div className="text-xs text-slate-400">{t('Gasto este mes')}</div><div className="text-xl font-bold text-brand-navy dark:text-slate-100">{money(stats.mes)}</div></Card>
            </div>

            <Card className="mb-4 p-4">
              <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Costos por material')}</h3>
              {stats.porMaterial.length === 0 ? <p className="text-sm text-slate-400">{t('Sin entregas todavía.')}</p> : (
                <Tabla columns={[{ key: 'material', label: t('Material') }, { key: 'ton', label: t('Toneladas'), align: 'right' }, { key: 'gasto', label: t('Gasto'), align: 'right' }]}
                  rows={stats.porMaterial.map((m) => ({ ...m, _key: m.material }))}
                  renderCell={(r, k) => k === 'gasto' ? money(r.gasto) : k === 'ton' ? Math.round(r.ton) : r[k]} />
              )}
            </Card>

            <Card className="p-4">
              <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">{t('Órdenes recientes')}</h3>
              {ordenes.length === 0 ? <p className="text-sm text-slate-400">{t('Aún no hay órdenes.')}</p> : (
                <Tabla columns={[{ key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') }, { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'precioCliente', label: t('Precio'), align: 'right' }, { key: 'estado', label: t('Estado'), align: 'center' }]}
                  rows={ordenes.slice().sort((a, b) => (b.numero || '').localeCompare(a.numero || '')).slice(0, 50).map((o) => ({ ...o, _key: o.id }))}
                  renderCell={(o, k) => {
                    if (k === 'ton') return o.pesoReal ?? o.pesoEstimado
                    if (k === 'precioCliente') return o.precioCliente != null ? money(o.precioCliente) : '—'
                    if (k === 'estado') return <Badge color={ENTREGADAS.includes(o.estado) ? 'green' : 'navy'}>{t(ORDEN_ESTADO_LABEL[o.estado])}</Badge>
                    return o[k]
                  }} />
              )}
            </Card>

            <Card className="mt-4 p-4">
              <div className="mb-3 flex items-center gap-2"><FileText size={17} className="text-amber-500" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Facturas')}</h3></div>
              {facturas.length === 0 ? <p className="text-sm text-slate-400">{t('Aún no tienes facturas.')}</p> : (
                <Tabla columns={[{ key: 'numero', label: t('Factura') }, { key: 'periodo', label: t('Periodo') }, { key: 'total', label: t('Total'), align: 'right' }, { key: 'estado', label: t('Estado'), align: 'center' }, { key: 'acciones', label: '', align: 'right' }]}
                  rows={facturas.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((x) => ({ ...x, _key: x.id }))}
                  renderCell={(r, k) => {
                    if (k === 'periodo') return <span className="text-xs text-slate-400">{r.desde || '—'} → {r.hasta || '—'}</span>
                    if (k === 'total') return money(r.total)
                    if (k === 'estado') return <Badge color={r.estado === 'firmada' ? 'green' : r.estado === 'pagada' ? 'navy' : 'gold'}>{r.estado}</Badge>
                    if (k === 'acciones') return (
                      <div className="flex justify-end gap-1.5">
                        {r.estado === 'enviada' && <Boton variant="gold" onClick={() => { setFirmando(r); setFirma(null) }} className="px-2.5 py-1 text-xs"><PenLine size={13} /> {t('Revisar y firmar')}</Boton>}
                        <Boton variant="ghost" onClick={() => generarFacturaPDF(r, { clienteNombre: r.clienteNombre, empresa: 'Freight' })} className="px-2.5 py-1 text-xs"><Download size={13} /> PDF</Boton>
                      </div>
                    )
                    return r[k]
                  }} />
              )}
            </Card>
          </>
        )}
      </main>

      {firmando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setFirmando(null)}>
          <Card className="w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="m-0 mb-2 text-base font-bold text-brand-navy dark:text-slate-100">{t('Revisar factura')} {firmando.numero}</h3>
            <div className="scroll-thin mb-3 max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700/60">
              <Tabla columns={[{ key: 'numero', label: t('Orden') }, { key: 'material', label: t('Material') }, { key: 'ton', label: t('Ton'), align: 'right' }, { key: 'precio', label: t('Precio'), align: 'right' }]}
                rows={(firmando.lineas || []).map((l, i) => ({ ...l, _key: i }))}
                renderCell={(l, k) => k === 'precio' ? money(l.precio) : l[k]} minWidth="min-w-[360px]" />
            </div>
            <div className="mb-2 text-right text-lg font-bold text-brand-navy dark:text-slate-100">{t('Total')}: {money(firmando.total)}</div>
            <div className="mb-1 text-xs font-semibold text-slate-500">{t('Firma de aprobación')}</div>
            <FirmaPad onChange={setFirma} />
            <div className="mt-3 flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setFirmando(null)}>{t('Cancelar')}</Boton>
              <Boton variant="gold" onClick={firmarFactura} disabled={!firma}><PenLine size={15} /> {t('Aprobar y firmar')}</Boton>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
