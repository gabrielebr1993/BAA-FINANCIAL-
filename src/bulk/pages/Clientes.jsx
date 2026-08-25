import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Building2, MapPin, Trash2, Clock } from 'lucide-react'
import { useColeccion } from '../data/useColeccion'
import { crear, eliminar, reservarCodigo } from '../data/repo'
import { where } from '../data/repo'
import { useBulkAuth } from '../BulkAuthContext'
import { PageTitle, Card, Boton, Input, Cargando, EstadoVacio, Badge } from '../../components/ui'
import { Gate } from '../components/Gate'
import BuscadorDireccion from '../components/BuscadorDireccion'
import { UserId } from '../components/UserId'
import Avatar from '../components/Avatar'
import { useAvatares } from '../data/useCodigoUsuario'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

// "07:30" → "7:30 am" (para guardar un horario legible junto a las horas exactas)
function hora12(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number)
  if (!Number.isFinite(h)) return ''
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m || 0).padStart(2, '0')} ${ampm}`
}

function Plantas({ cliente }) {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { datos: plantas } = useColeccion('plants', [where('clienteId', '==', cliente.id)])
  const { datos: materiales } = useColeccion('materials')
  const [f, setF] = useState({ nombre: '', direccion: '', lat: '', lng: '', horaAbre: '', horaCierra: '', ofertas: [], dir: null })
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))
  // Al elegir una sugerencia de Google: rellena dirección + GPS y sugiere el nombre.
  const elegirDireccion = (d) => setF((s) => ({
    ...s, dir: d,
    direccion: [d.direccion, d.ciudad, d.estado, d.zip].filter(Boolean).join(', '),
    lat: String(d.lat), lng: String(d.lng),
    nombre: s.nombre || String(d.direccion || '').split(',')[0] || '',
  }))
  const tieneMat = (m) => f.ofertas.some((o) => o.material === m)
  const toggleMat = (m) => setF((s) => tieneMat(m)
    ? ({ ...s, ofertas: s.ofertas.filter((o) => o.material !== m) })
    : ({ ...s, ofertas: [...s.ofertas, { material: m, precio: '', po: '' }] }))
  const setOferta = (m, k, v) => setF((s) => ({ ...s, ofertas: s.ofertas.map((o) => (o.material === m ? { ...o, [k]: v } : o)) }))

  const agregar = async () => {
    if (!f.nombre.trim()) return
    const ofertas = f.ofertas.map((o) => ({ material: o.material, precio: Number(o.precio) || 0, po: (o.po || '').trim() }))
    await crear('plants', tenantId, {
      clienteId: cliente.id, nombre: f.nombre.trim(), direccion: f.direccion.trim(),
      gps: (f.lat && f.lng) ? { lat: Number(f.lat), lng: Number(f.lng) } : null,
      horaAbre: f.horaAbre || null, horaCierra: f.horaCierra || null,
      horario: f.horaAbre && f.horaCierra ? `${hora12(f.horaAbre)} – ${hora12(f.horaCierra)}` : '',
      ofertas, materiales: ofertas.map((o) => o.material), activo: true,
    })
    setF({ nombre: '', direccion: '', lat: '', lng: '', horaAbre: '', horaCierra: '', ofertas: [], dir: null })
  }
  const matsActivos = materiales.filter((m) => m.activo !== false)

  return (
    <div className="mt-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700/60">
      <div className="mb-2 text-xs font-semibold uppercase text-slate-400">{t('Plantas de ')}{cliente.nombre}</div>
      {plantas.map((p) => (
        <div key={p.id} className="mb-1.5 rounded-lg border border-slate-100 p-2 dark:border-slate-700/50">
          <div className="flex items-center gap-2 text-sm">
            <MapPin size={14} className="text-amber-500" />
            <span className="font-medium">{p.nombre}</span>
            <span className="text-slate-400">{p.direccion}{p.gps ? ` · ${p.gps.lat}, ${p.gps.lng}` : ''}</span>
            {(p.horario || (p.horaAbre && p.horaCierra)) && (
              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                <Clock size={11} /> {p.horario || `${hora12(p.horaAbre)} – ${hora12(p.horaCierra)}`}
              </span>
            )}
            <button onClick={() => eliminar('plants', p.id)} className="ml-auto text-rose-400 hover:text-rose-600"><Trash2 size={13} /></button>
          </div>
          {((p.ofertas && p.ofertas.length) || (p.materiales || []).length) > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {(p.ofertas && p.ofertas.length ? p.ofertas : (p.materiales || []).map((m) => ({ material: m }))).map((o) => (
                <Badge key={o.material} color="green">{t(o.material)}{o.precio ? ` · ${money(o.precio)}` : ''}{o.po ? ` · PO ${o.po}` : ''}</Badge>
              ))}
            </div>
          )}
        </div>
      ))}
      <div className="mt-2">
        <BuscadorDireccion
          seleccion={f.dir}
          onElegir={elegirDireccion}
          onLimpiar={() => setF((s) => ({ ...s, dir: null, direccion: '', lat: '', lng: '' }))}
          placeholder={t('Busca la dirección de la planta (Google Maps)…')}
        />
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Input placeholder={t('Nombre de la planta')} value={f.nombre} onChange={set('nombre')} />
        <Input placeholder={t('Dirección (o elígela arriba)')} value={f.direccion} onChange={set('direccion')} />
        <Input placeholder={t('Lat (GPS)')} value={f.lat} onChange={set('lat')} />
        <Input placeholder={t('Lng (GPS)')} value={f.lng} onChange={set('lng')} />
        <div className="flex items-center gap-2 sm:col-span-2">
          <Clock size={15} className="flex-shrink-0 text-amber-500" />
          <label className="flex flex-1 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {t('Abre')}
            <Input type="time" value={f.horaAbre} onChange={set('horaAbre')} className="flex-1" />
          </label>
          <label className="flex flex-1 items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            {t('Cierra')}
            <Input type="time" value={f.horaCierra} onChange={set('horaCierra')} className="flex-1" />
          </label>
          {f.horaAbre && f.horaCierra && (
            <span className="hidden whitespace-nowrap text-xs font-semibold text-emerald-600 dark:text-emerald-400 sm:inline">
              {hora12(f.horaAbre)} – {hora12(f.horaCierra)}
            </span>
          )}
        </div>
      </div>
      {matsActivos.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[11px] font-semibold uppercase text-slate-400">{t('Materiales que ofrece esta planta (precio y PO por material)')}</div>
          <div className="flex flex-wrap gap-1.5">
            {matsActivos.map((m) => (
              <button key={m.id} type="button" onClick={() => toggleMat(m.nombre)} className={`rounded-lg border px-2.5 py-1 text-xs ${tieneMat(m.nombre) ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'border-slate-200 text-slate-500 dark:border-slate-700'}`}>{t(m.nombre)}</button>
            ))}
          </div>
          {f.ofertas.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {f.ofertas.map((o) => (
                <div key={o.material} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="w-28 font-medium text-brand-navy dark:text-slate-100">{t(o.material)}</span>
                  <Input type="number" step="0.01" placeholder={t('Precio')} value={o.precio} onChange={(e) => setOferta(o.material, 'precio', e.target.value)} className="w-24 py-1" />
                  <Input placeholder="PO" value={o.po} onChange={(e) => setOferta(o.material, 'po', e.target.value)} className="w-28 py-1" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="mt-2"><Boton variant="ghost" onClick={agregar} disabled={!f.nombre.trim()} className="text-xs"><Plus size={14} /> {t('Agregar planta')}</Boton></div>
    </div>
  )
}

export default function Clientes() {
  const { t } = useLang()
  const { tenantId } = useBulkAuth()
  const { datos: clientes, cargando } = useColeccion('clients')
  const { datos: usuarios } = useColeccion('users')
  const avatares = useAvatares()
  const uidPorCliente = {}
  for (const u of usuarios || []) if (u.rol === 'cliente' && u.clienteId && !uidPorCliente[u.clienteId]) uidPorCliente[u.clienteId] = u.id
  const [f, setF] = useState({ nombre: '', rfc: '', contacto: '', facturacion: '' })
  const [abierto, setAbierto] = useState(null)
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }))

  const agregar = async () => {
    if (!f.nombre.trim()) return
    // ID único de perfil (mismo contador global que usuarios y transportistas) al crear.
    let codigo = null
    try { const piso = clientes.reduce((m, c) => { const n = parseInt(c?.codigo, 10); return Number.isFinite(n) && n > m ? n : m }, 0); codigo = await reservarCodigo(tenantId, piso) } catch { /* se rellena luego en Usuarios */ }
    await crear('clients', tenantId, { nombre: f.nombre.trim(), rfc: f.rfc.trim(), contacto: f.contacto.trim(), facturacion: f.facturacion.trim(), activo: true, ...(codigo ? { codigo } : {}) })
    setF({ nombre: '', rfc: '', contacto: '', facturacion: '' })
  }

  if (cargando) return <Cargando />
  return (
    <div>
      <PageTitle>{t('Clientes y Plantas')}</PageTitle>
      <Card className="mb-4 p-4">
        <h3 className="m-0 mb-3 text-sm font-bold text-brand-navy dark:text-slate-100">{t('Nuevo cliente')}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Input placeholder={t('Nombre')} value={f.nombre} onChange={set('nombre')} />
          <Input placeholder={t('RFC / Tax ID')} value={f.rfc} onChange={set('rfc')} />
          <Input placeholder={t('Contacto')} value={f.contacto} onChange={set('contacto')} />
          <Input placeholder={t('Datos de facturación')} value={f.facturacion} onChange={set('facturacion')} />
        </div>
        <div className="mt-3"><Gate perm="clientes.crear"><Boton variant="gold" onClick={agregar} disabled={!f.nombre.trim()}><Plus size={16} /> {t('Agregar cliente')}</Boton></Gate></div>
      </Card>

      {clientes.length === 0 ? <EstadoVacio titulo={t('Sin clientes')} texto={t('Agrega el primero arriba.')} mostrarBoton={false} /> : (
        <div className="space-y-3">
          {clientes.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-center gap-2">
                <Avatar foto={avatares[uidPorCliente[c.id]]} nombre={c.nombre} size={40} />
                <Building2 size={17} className="text-amber-500" />
                <Link to={`/bulk/cliente/${c.id}`} className="font-bold text-brand-navy hover:text-amber-600 hover:underline dark:text-slate-100">{c.nombre}</Link>
                <UserId codigo={c.codigo} />
                {c.rfc && <Badge color="slate">{c.rfc}</Badge>}
                <button onClick={() => setAbierto(abierto === c.id ? null : c.id)} className="ml-auto text-xs text-amber-600 hover:underline">{abierto === c.id ? t('Ocultar plantas') : t('Ver / agregar plantas')}</button>
                <Gate perm="clientes.eliminar"><button onClick={() => window.confirm(`${t('¿Eliminar cliente "')}${c.nombre}${t('"?')}`) && eliminar('clients', c.id)} className="text-rose-400 hover:text-rose-600"><Trash2 size={15} /></button></Gate>
              </div>
              {(c.contacto || c.facturacion) && <div className="mt-1 text-xs text-slate-400">{c.contacto}{c.facturacion ? ` · ${c.facturacion}` : ''}</div>}
              {abierto === c.id && <Plantas cliente={c} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
