import { useMemo, useState } from 'react'
import { FileText, Download, Plus, CheckCircle2 } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { auditar } from '../data/auditoria'
import { armarFactura } from '../domain/facturacion'
import { generarFacturaPDF } from '../data/facturaPDF'
import { PageTitle, Card, Boton, Input, Select, Badge, Cargando, Aviso, Tabla } from '../../components/ui'
import { money } from '../../utils/format'

const ESTADO_COLOR = { enviada: 'gold', firmada: 'green', pagada: 'navy' }

export default function Facturacion() {
  const { tenantId, usuario, rol } = useBulkAuth()
  const empresa = usuario?.empresa || 'Freight'
  const { datos: clientes } = useColeccion('clients')
  const { datos: ordenes, cargando } = useColeccion('orders')
  const { datos: facturas } = useColeccion('invoices')
  const [f, setF] = useState({ clienteId: '', desde: '', hasta: '' })
  const [msg, setMsg] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const nombreCliente = (id) => clientes.find((c) => c.id === id)?.nombre || '—'
  const preview = useMemo(() => f.clienteId ? armarFactura(ordenes.filter((o) => o.clienteId === f.clienteId), { desde: f.desde, hasta: f.hasta }) : null, [ordenes, f])

  const generar = async () => {
    if (!f.clienteId || !preview || preview.n === 0) { setMsg({ tipo: 'warn', txt: 'Selecciona un cliente con órdenes entregadas en el periodo.' }); return }
    const numero = `FAC-${Date.now().toString(36).toUpperCase().slice(-6)}`
    await crear('invoices', tenantId, {
      numero, clienteId: f.clienteId, clienteNombre: nombreCliente(f.clienteId),
      desde: f.desde || null, hasta: f.hasta || null,
      lineas: preview.lineas, total: preview.total, toneladas: preview.toneladas,
      estado: 'enviada', ts: new Date().toISOString(),
    })
    await auditar(tenantId, { usuario: usuario?.email, rol, accion: 'generar_factura', entidad: 'factura', detalle: `${numero} · ${nombreCliente(f.clienteId)} · ${money(preview.total)}` })
    setMsg({ tipo: 'ok', txt: `Factura ${numero} generada y enviada al cliente para su aprobación.` })
    setF({ clienteId: '', desde: '', hasta: '' })
  }

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>Facturación</PageTitle>
      {msg && <Aviso tipo={msg.tipo} className="mb-3">{msg.txt}</Aviso>}

      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">Nueva factura</h3>
        <div className="grid gap-3 sm:grid-cols-4">
          <Select value={f.clienteId} onChange={set('clienteId')}><option value="">— Cliente —</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</Select>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">Desde</div><Input type="date" value={f.desde} onChange={set('desde')} /></div>
          <div><div className="mb-1 text-[11px] uppercase text-slate-400">Hasta</div><Input type="date" value={f.hasta} onChange={set('hasta')} /></div>
          <div className="flex items-end"><Boton variant="gold" onClick={generar} disabled={!preview || preview.n === 0}><Plus size={16} /> Generar</Boton></div>
        </div>
        {preview && (
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50">
            {preview.n === 0 ? <span className="text-slate-400">Sin órdenes entregadas para ese cliente/periodo.</span> : <span><b>{preview.n}</b> órdenes · <b>{preview.toneladas}</b> ton · Total <b className="text-brand-navy dark:text-slate-100">{money(preview.total)}</b></span>}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h3 className="m-0 mb-3 text-base font-bold text-brand-navy dark:text-slate-100">Facturas emitidas ({facturas.length})</h3>
        {facturas.length === 0 ? <p className="text-sm text-slate-400">Aún no hay facturas.</p> : (
          <Tabla
            columns={[{ key: 'numero', label: 'Factura' }, { key: 'clienteNombre', label: 'Cliente' }, { key: 'periodo', label: 'Periodo' }, { key: 'toneladas', label: 'Ton', align: 'right' }, { key: 'total', label: 'Total', align: 'right' }, { key: 'estado', label: 'Estado', align: 'center' }, { key: 'acciones', label: '', align: 'right' }]}
            rows={facturas.slice().sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).map((x) => ({ ...x, _key: x.id }))}
            renderCell={(r, k) => {
              if (k === 'periodo') return <span className="text-xs text-slate-400">{r.desde || '—'} → {r.hasta || '—'}</span>
              if (k === 'total') return money(r.total)
              if (k === 'estado') return <Badge color={ESTADO_COLOR[r.estado] || 'slate'}>{r.estado}{r.firma ? ' ✓' : ''}</Badge>
              if (k === 'acciones') return <Boton variant="ghost" onClick={() => generarFacturaPDF(r, { clienteNombre: r.clienteNombre, empresa })} className="px-2.5 py-1 text-xs"><Download size={13} /> PDF</Boton>
              return r[k]
            }}
          />
        )}
      </Card>
    </div>
  )
}
