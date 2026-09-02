// SITIO PÚBLICO · /roles — Roles y multi-empresa. Demo interactivo: un
// conmutador de rol que cambia lo que se ve en pantalla, demostrando que cada
// quien ve SOLO lo suyo (datos de ejemplo, solo front-end).
import { useState } from 'react'
import { Users, Shield, Eye, Building2, LayoutDashboard, Map as MapIcon, Wallet, Smartphone, Ticket } from 'lucide-react'
import { useLangPub, PaginaFuncion, NAVY, NAVY_DEEP, GOLD, CREAM, OK } from './comun'

function DemoRoles({ tx }) {
  const ROLES = [
    { k: 'admin', es: 'Admin', en: 'Admin' },
    { k: 'dispatcher', es: 'Dispatcher', en: 'Dispatcher' },
    { k: 'carrier', es: 'Transportista', en: 'Carrier' },
    { k: 'cliente', es: 'Cliente', en: 'Customer' },
    { k: 'chofer', es: 'Chofer', en: 'Driver' },
  ]
  const [rol, setRol] = useState('admin')
  const VISTAS = {
    admin: {
      ve: [tx('Todos los precios y márgenes', 'All prices and margins'), tx('Facturación y Fast Pay', 'Billing and Fast Pay'), tx('Usuarios, roles y auditoría', 'Users, roles and audit log'), tx('Mapa en vivo completo', 'Full live map')],
      nove: [],
      items: [{ i: Wallet, l: tx('Utilidad del día', "Today's profit"), v: '$2,418' }, { i: LayoutDashboard, l: tx('Órdenes activas', 'Active orders'), v: '14' }, { i: MapIcon, l: tx('Camiones en mapa', 'Trucks on map'), v: '9' }],
    },
    dispatcher: {
      ve: [tx('Cola de órdenes y asignación', 'Order queue and assignment'), tx('Mapa en vivo y ETAs', 'Live map and ETAs'), tx('Chat con choferes', 'Driver chat')],
      nove: [tx('Utilidad y márgenes del dueño', "Owner's profit and margins")],
      items: [{ i: LayoutDashboard, l: tx('Órdenes en cola', 'Queued orders'), v: '3' }, { i: MapIcon, l: tx('Camiones en mapa', 'Trucks on map'), v: '9' }],
    },
    carrier: {
      ve: [tx('SUS órdenes y SUS choferes', 'THEIR orders and THEIR drivers'), tx('Su tarifa y el pago de cada chofer', "Their rate and each driver's pay"), tx('Desglose de pagos con Fast Pay', 'Pay statements with Fast Pay')],
      nove: [tx('Lo que tú le cobras al cliente', 'What you charge the customer'), tx('Datos de otros transportistas', "Other carriers' data")],
      items: [{ i: Wallet, l: tx('Por cobrar', 'Receivable'), v: '$1,065' }, { i: Users, l: tx('Mis choferes', 'My drivers'), v: '5' }],
    },
    cliente: {
      ve: [tx('SUS pedidos y su avance en tonos', 'THEIR orders and tonnage progress'), tx('Mapa de SUS viajes con ETA', 'Map of THEIR trips with ETA'), tx('Sus tickets y facturas', 'Their tickets and invoices')],
      nove: [tx('Tus costos y lo que pagas al transporte', 'Your costs and what you pay carriers')],
      items: [{ i: Ticket, l: tx('Recibido hoy', 'Received today'), v: '148.2 tn' }, { i: MapIcon, l: tx('Viajes en camino', 'Trips en route'), v: '2' }],
    },
    chofer: {
      ve: [tx('SU viaje actual, paso a paso', 'THEIR current trip, step by step'), tx('SU pago y sus ganancias', 'THEIR pay and earnings'), tx('Fast Pay a su tarjeta', 'Fast Pay to their card')],
      nove: [tx('Tarifas del cliente y del transporte', 'Customer and carrier rates')],
      items: [{ i: Smartphone, l: tx('Viaje actual', 'Current trip'), v: 'JRV-0151' }, { i: Wallet, l: tx('Ganado esta semana', 'Earned this week'), v: '$487' }],
    },
  }
  const v = VISTAS[rol]
  return (
    <div className="rounded-[20px] border p-4 sm:p-5" style={{ background: 'linear-gradient(160deg,#16294a,#101f38)', borderColor: 'rgba(201,162,75,.2)', boxShadow: '0 40px 80px -30px rgba(0,0,0,.6)' }}>
      <div className="f-mono mb-3 text-[12px] uppercase tracking-wider" style={{ color: 'rgba(248,243,235,.55)' }}>{tx('Pruébalo tú: cambia de rol', 'Try it: switch roles')}</div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {ROLES.map((r) => (
          <button key={r.k} onClick={() => setRol(r.k)} className="f-mono rounded-lg border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition"
            style={rol === r.k ? { background: GOLD, color: NAVY_DEEP, borderColor: GOLD } : { color: 'rgba(248,243,235,.6)', borderColor: 'rgba(248,243,235,.2)' }}>{tx(r.es, r.en)}</button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {v.items.map((it, i) => (
          <div key={i} className="rounded-xl border p-3" style={{ background: 'rgba(255,255,255,.04)', borderColor: 'rgba(255,255,255,.08)' }}>
            <it.i size={16} style={{ color: GOLD }} />
            <div className="f-display mt-1.5 text-[18px] font-bold" style={{ color: CREAM }}>{it.v}</div>
            <div className="text-[11px]" style={{ color: 'rgba(248,243,235,.55)' }}>{it.l}</div>
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border p-3" style={{ borderColor: 'rgba(63,157,107,.4)', background: 'rgba(63,157,107,.07)' }}>
          <div className="f-mono mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: '#67c295' }}><Eye size={12} /> {tx('Este rol VE', 'This role SEES')}</div>
          {v.ve.map((s, i) => <div key={i} className="py-0.5 text-[12.5px]" style={{ color: 'rgba(248,243,235,.8)' }}>· {s}</div>)}
        </div>
        <div className="rounded-xl border p-3" style={{ borderColor: 'rgba(255,99,99,.35)', background: 'rgba(255,99,99,.05)' }}>
          <div className="f-mono mb-1.5 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-widest" style={{ color: '#f2a1a1' }}><Shield size={12} /> {tx('Este rol NO VE', 'This role does NOT see')}</div>
          {v.nove.length === 0 && <div className="py-0.5 text-[12.5px]" style={{ color: 'rgba(248,243,235,.5)' }}>{tx('— es el dueño del sistema: lo ve todo', '— they own the system: they see everything')}</div>}
          {v.nove.map((s, i) => <div key={i} className="py-0.5 text-[12.5px]" style={{ color: 'rgba(248,243,235,.8)' }}>· {s}</div>)}
        </div>
      </div>
    </div>
  )
}

export default function RolesPub() {
  const { lang, fijar, tx } = useLangPub()
  return (
    <PaginaFuncion
      lang={lang} fijar={fijar} tx={tx} activo="/roles"
      hero={{
        migas: tx('Roles y multi-empresa', 'Roles & multi-company'),
        icono: Users,
        titulo: <>{tx('Cada quien ve ', 'Everyone sees ')}<em className="not-italic" style={{ color: GOLD }}>{tx('solo lo suyo.', 'only their part.')}</em></>,
        sub: tx('Admin, dispatcher, supervisor de planta, transportista, cliente y chofer entran al MISMO sistema, pero cada rol tiene su portal con exactamente lo que le toca — y los precios que no le tocan, ni existen en su pantalla. Las reglas se aplican en el servidor, no son cosmética.', 'Admin, dispatcher, plant supervisor, carrier, customer and driver log into the SAME system, but each role gets its own portal with exactly what belongs to them — and the prices that do not are not even sent to their screen. Rules are enforced server-side, not cosmetic.'),
        visual: <DemoRoles tx={tx} />,
      }}
      pasos={{
        titulo: tx('Un sistema, seis puertas', 'One system, six doors'),
        items: [
          { icono: Users, t: tx('Invitas por rol', 'You invite by role'), d: tx('Creas cada usuario con su rol y su empresa (tu operación, un transportista, un cliente). Cada quien recibe su acceso.', 'Create each user with their role and company (your operation, a carrier, a customer). Everyone gets their own access.') },
          { icono: Shield, t: tx('El servidor filtra', 'The server filters'), d: tx('Los permisos viven en las reglas de la base de datos: un transportista no puede leer tu margen ni aunque lo intente por fuera de la app.', 'Permissions live in the database rules: a carrier cannot read your margin even trying outside the app.') },
          { icono: Building2, t: tx('Todos trabajan a la vez', 'Everyone works at once'), d: tx('Cliente pidiendo, dispatcher despachando, chofer entregando y transportista cobrando — sobre los mismos datos en vivo.', 'Customer ordering, dispatcher dispatching, driver delivering and carrier collecting — on the same live data.') },
        ],
      }}
      metricas={[
        { n: '6', pct: 100, t: tx('portales por rol', 'role portals'), d: tx('Cada uno con SU vista y SUS números.', 'Each with THEIR view and THEIR numbers.') },
        { n: '3', pct: 100, t: tx('precios separados', 'separate price lanes'), d: tx('Cliente, transporte y chofer nunca se cruzan.', 'Customer, carrier and driver never cross.') },
        { n: '∞', pct: 100, t: tx('empresas conectadas', 'connected companies'), d: tx('Transportistas y clientes sin costo por asiento.', 'Carriers and customers without per-seat fees.') },
        { n: '100%', pct: 100, t: tx('auditado', 'audited'), d: tx('Quién hizo qué y cuándo, siempre.', 'Who did what and when, always.') },
      ]}
    />
  )
}
