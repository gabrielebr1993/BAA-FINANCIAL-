// ============================================================================
// ECOMMERCE · Equipo y permisos + propuesta técnica de Integraciones.
//
// ROLES del módulo (spec punto 4):
//  · cliente       → el registro público SIEMPRE crea clientes; solo ve lo suyo.
//  · manager       → pedidos, incidencias, logística de sus países asignados.
//                    Precios y finanzas SOLO con permiso explícito.
//  · accounting    → consulta/exporta finanzas; ejecutar movimientos requiere
//                    permiso específico; jamás toca usuarios ni logística.
//  · dueño         → tu cuenta (por correo verificado), control total.
//
// HOY (módulo privado): las invitaciones quedan REGISTRADAS con sus permisos,
// pero nadie más puede entrar — el candado por correo del dueño manda, aquí y
// en firestore.rules. Cuando autorices publicar, ese candado se abre por rol
// usando exactamente estos registros, sin migrar nada.
// ============================================================================
import { useEffect, useState } from 'react'
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../firebase'
import { Card, PageTitle, Boton, Aviso, Badge, Input, Select, Spinner, EstadoVacio } from '../components/ui'
import { Plus, Eye } from 'lucide-react'

const PERMISOS = [
  { id: 'pedidos', label: 'Gestionar pedidos e incidencias' },
  { id: 'logistica', label: 'Almacenes, choferes, rutas y entregas' },
  { id: 'precios', label: 'Cambiar precios y márgenes' },
  { id: 'finanzas_ver', label: 'Ver y exportar finanzas' },
  { id: 'finanzas_ejecutar', label: 'Ejecutar reembolsos y pagos' },
  { id: 'catalogo', label: 'Editar catálogo' },
]
const ROLES = [
  { id: 'manager', nombre: 'Manager', base: ['pedidos', 'logistica'] },
  { id: 'accounting', nombre: 'Accounting / Contabilidad', base: ['finanzas_ver'] },
]

export function EcomEquipo({ ctx }) {
  const { auditar, config } = ctx
  const [internos, setInternos] = useState(null)
  const [form, setForm] = useState(null)
  const [vistaRol, setVistaRol] = useState(null)
  const recargar = async () => {
    const snap = await getDocs(collection(db, 'ecom_internos'))
    setInternos(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
  }
  useEffect(() => { recargar() }, [])
  const invitar = async () => {
    if (!form.correo.trim() || !form.nombre.trim()) return window.alert('Nombre y correo son obligatorios.')
    await addDoc(collection(db, 'ecom_internos'), {
      ...form, correo: form.correo.trim().toLowerCase(), activo: false, estado: 'invitado_pendiente',
      creadoEn: serverTimestamp(),
    })
    auditar('interno_invitado', `${form.correo} como ${form.rol}`)
    setForm(null); await recargar()
  }
  const alternar = async (u) => {
    await updateDoc(doc(db, 'ecom_internos', u.id), { activo: !u.activo })
    auditar(u.activo ? 'interno_desactivado' : 'interno_activado', u.correo)
    await recargar()
  }
  if (!internos) return <div className="py-16 text-center"><Spinner /></div>
  return (
    <div>
      <PageTitle right={<Boton variant="gold" onClick={() => setForm({ nombre: '', correo: '', telefono: '', rol: 'manager', permisos: ROLES[0].base, paises: [] })}><Plus size={15} /> Invitar usuario interno</Boton>}>Equipo y permisos</PageTitle>
      <Aviso tipo="warn" className="mb-4">
        <b>El módulo sigue privado:</b> aunque invites a alguien, NADIE más puede entrar todavía (el candado por tu correo manda, también en las reglas de la base de datos). Las invitaciones quedan listas con sus permisos para cuando tú autorices abrir el módulo. El <b>registro público siempre creará clientes</b>: ningún usuario puede asignarse un rol interno.
      </Aviso>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {ROLES.map((r) => (
          <Card key={r.id} className="p-4">
            <div className="flex items-center gap-2"><b className="text-brand-navy dark:text-slate-100">{r.nombre}</b>
              <Boton variant="ghost" className="ml-auto" onClick={() => setVistaRol(r)}><Eye size={14} /> Previsualizar permisos</Boton>
            </div>
            <ul className="mt-2 space-y-1 text-xs text-slate-500">
              {PERMISOS.map((p) => (
                <li key={p.id}>{r.base.includes(p.id) ? '✓' : '✗'} {p.label}{!r.base.includes(p.id) && (p.id === 'precios' || p.id.startsWith('finanzas')) ? ' (requiere permiso explícito)' : ''}</li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      {internos.length === 0 ? <EstadoVacio titulo="Sin usuarios internos" texto="Invita a tu primer manager o contador; quedará pendiente hasta que abras el módulo." /> : (
        <div className="space-y-2.5">
          {internos.map((u) => (
            <Card key={u.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <b className="text-brand-navy dark:text-slate-100">{u.nombre}</b>
                <span className="text-sm text-slate-500">{u.correo}</span>
                <Badge color="slate">{u.rol}</Badge>
                <Badge color={u.activo ? 'green' : 'gold'}>{u.activo ? 'activo (al publicar)' : 'pendiente'}</Badge>
                <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <input type="checkbox" checked={!!u.activo} onChange={() => alternar(u)} /> Habilitado para cuando se publique
                </label>
              </div>
              <div className="mt-1 text-xs text-slate-500">Permisos: {(u.permisos || []).join(', ') || '—'} · Países: {(u.paises || []).join(', ') || 'todos'}</div>
            </Card>
          ))}
        </div>
      )}

      {form && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => setForm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 text-lg font-bold text-brand-navy dark:text-slate-100">Invitar usuario interno</div>
            <div className="space-y-2.5 text-sm">
              <label>Nombre<Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} /></label>
              <label>Correo<Input type="email" value={form.correo} onChange={(e) => setForm((f) => ({ ...f, correo: e.target.value }))} /></label>
              <label>Teléfono<Input value={form.telefono} onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))} /></label>
              <label>Rol
                <Select value={form.rol} onChange={(e) => { const r = ROLES.find((x) => x.id === e.target.value); setForm((f) => ({ ...f, rol: e.target.value, permisos: r ? [...r.base] : [] })) }}>
                  {ROLES.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                </Select>
              </label>
              <div>
                <div className="mb-1">Permisos</div>
                {PERMISOS.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-xs">
                    <input type="checkbox" checked={(form.permisos || []).includes(p.id)}
                      onChange={(e) => setForm((f) => ({ ...f, permisos: e.target.checked ? [...f.permisos, p.id] : f.permisos.filter((x) => x !== p.id) }))} />
                    {p.label}
                  </label>
                ))}
              </div>
              <label>Países asignados (vacío = todos)
                <Input placeholder="VE, CO…" value={(form.paises || []).join(', ')} onChange={(e) => setForm((f) => ({ ...f, paises: e.target.value.split(',').map((x) => x.trim().toUpperCase()).filter(Boolean) }))} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Boton variant="ghost" onClick={() => setForm(null)}>Cancelar</Boton>
              <Boton variant="gold" onClick={invitar}>Invitar (queda pendiente)</Boton>
            </div>
          </div>
        </div>
      )}

      {vistaRol && (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={() => setVistaRol(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-5 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 text-lg font-bold text-brand-navy dark:text-slate-100">Vista previa: {vistaRol.nombre}</div>
            <p className="text-sm text-slate-500">Lo que vería este rol al publicarse el módulo (sin habilitar acceso a nadie):</p>
            <ul className="mt-3 space-y-1.5 text-sm">
              <li>✓ Pestañas visibles: {vistaRol.id === 'manager' ? 'Pedidos, Compras, Soporte' : 'Finanzas (solo lectura), Exportar'}</li>
              <li>✗ Ocultas: {vistaRol.id === 'manager' ? 'Precios, Finanzas, Equipo, Configuración' : 'Catálogo, Pedidos (edición), Equipo, Configuración'}</li>
              <li>• Países: según asignación del dueño</li>
              <li>• Toda acción queda en la auditoría (ecom_audit)</li>
            </ul>
            <Boton variant="ghost" className="mt-4" onClick={() => setVistaRol(null)}>Cerrar</Boton>
          </div>
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">Países configurados: {(config.paises || []).filter((p) => p.activo).map((p) => p.codigo).join(', ')}. Autenticación reforzada (verificación de correo y 2FA para internos) queda anotada como requisito de publicación.</p>
    </div>
  )
}

// ── INTEGRACIONES: propuesta técnica honesta, sin conexiones simuladas ─────
export function EcomIntegraciones() {
  const FILAS = [
    {
      nombre: 'Alibaba (B2B)',
      estado: 'Flujo manual implementado',
      color: 'gold',
      puntos: [
        'Qué existe: Alibaba Open Platform / Buyer API — orientada a compradores B2B con cuenta aprobada; acceso por solicitud y contrato comercial.',
        'Qué da: catálogo y órdenes B2B con MOQ (mínimos por producto), precios por volumen, Trade Assurance.',
        '¿Comprar desde mi plataforma? Solo con cuenta B2B aprobada y acuerdo; no es inmediato ni automático para cuentas nuevas.',
        'HOY en tu módulo: carga manual del producto autorizado (referencia + enlace de origen + MOQ) y compra asistida registrada en "Compras a proveedor" con evidencia.',
      ],
    },
    {
      nombre: 'AliExpress',
      estado: 'Flujo manual implementado',
      color: 'gold',
      puntos: [
        'Qué existe: AliExpress Affiliate API (solo enlaces y comisiones: NO sirve para vender dentro de tu plataforma) y AliExpress Dropshipping (DS) API: productos, precios, stock y CREACIÓN de órdenes.',
        'Requisitos DS: cuenta de dropshipper aprobada por AliExpress, app registrada en el portal de desarrolladores y token del vendedor.',
        'Restricciones: precios/stock deben refrescarse (no se pueden congelar), y hay categorías restringidas por país.',
        'HOY en tu módulo: producto cargado a mano con referencia/enlace; al aprobarte el programa DS, la compra se automatiza sobre el mismo registro de "Compras".',
      ],
    },
    {
      nombre: 'Amazon',
      estado: 'Solo compra asistida',
      color: 'red',
      puntos: [
        'Qué existe: Product Advertising API (PA-API 5.0) — SOLO para afiliados: muestra productos y precios con enlaces de Amazon; prohíbe usar los datos para revender dentro de otra plataforma de checkout.',
        'La API de compras (Amazon Business API / Buy with Prime) requiere cuenta Amazon Business y acuerdos; no está pensada para reventa B2C internacional.',
        'Conclusión honesta: NO se puede "revender Amazon" dentro de tu checkout con una integración estándar.',
        'HOY en tu módulo: compra ASISTIDA — el producto se carga a mano con su enlace, tu equipo lo compra en Amazon con la cuenta de la empresa y registra la evidencia en "Compras a proveedor".',
      ],
    },
    {
      nombre: 'Pasarela de pagos',
      estado: 'Pendiente de contrato',
      color: 'red',
      puntos: [
        'Para LATAM: Stripe (tarjetas int.), dLocal/EBANX (medios locales CO/MX/PE), Zelle/transferencia (VE, manual conciliado).',
        'El flujo ya está diseñado en el checkout: AUTORIZAR al pedir → CAPTURAR al confirmar proveedor → REEMBOLSAR si falla la adquisición.',
        'No se guardan datos completos de tarjeta: siempre tokenización de la pasarela.',
        'Requiere: elegir proveedor, contrato y credenciales — te lo presentaré para aprobación antes de activar nada.',
      ],
    },
  ]
  return (
    <div>
      <PageTitle>Integraciones — propuesta técnica</PageTitle>
      <Aviso tipo="info" className="mb-4">Resumen honesto de lo que cada proveedor permite hoy. <b>No hay conexiones simuladas:</b> lo que no tiene API disponible quedó implementado como flujo manual trazable (carga autorizada + compra asistida + evidencia). Antes de conectar cualquier proveedor real te presento credenciales/acuerdos necesarios y los apruebas tú.</Aviso>
      <div className="grid gap-3 lg:grid-cols-2">
        {FILAS.map((f) => (
          <Card key={f.nombre} className="p-5">
            <div className="flex items-center gap-2"><b className="text-brand-navy dark:text-slate-100">{f.nombre}</b><Badge color={f.color}>{f.estado}</Badge></div>
            <ul className="mt-2 space-y-1.5 text-[13px] text-slate-600 dark:text-slate-300">
              {f.puntos.map((p, i) => <li key={i}>• {p}</li>)}
            </ul>
          </Card>
        ))}
      </div>
      <Card className="mt-4 p-5">
        <b className="text-brand-navy dark:text-slate-100">Pendientes por país (antes de operar de verdad)</b>
        <ul className="mt-2 space-y-1.5 text-[13px] text-slate-600 dark:text-slate-300">
          <li>• <b>Venezuela:</b> definir quién importa (empresa como importador vs courier puerta a puerta), categorías restringidas y documentación del cliente si aplica.</li>
          <li>• <b>Colombia / México:</b> umbrales de minimis, IVA/aranceles por categoría y operador courier aliado; facturación local.</li>
          <li>• <b>Hub de origen (EE. UU./China):</b> dirección de recepción, consolidador y tarifario internacional firmado.</li>
          <li>• Verificar requisitos legales de cada mercado con asesor aduanal antes de habilitar ese país en Configuración.</li>
        </ul>
      </Card>
    </div>
  )
}
