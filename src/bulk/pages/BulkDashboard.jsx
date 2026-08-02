import { useMemo } from 'react'
import { ClipboardList, Truck, Building2, Weight, DollarSign, Timer, AlertTriangle, FileWarning, Award, FlaskConical, Layers } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useColeccion } from '../data/useColeccion'
import { useOrdenesConPagos } from '../data/useOrdenesConPagos'
import { ORDEN_ESTADO as E, ORDEN_ESTADO_LABEL } from '../domain/constants'
import { tiempoPromedioEntregaMin, estadoDocumento } from '../domain/facturacion'
import { alertaOrden } from '../domain/alertas'
import { PRESENCIA_TTL_MS } from '../domain/asignacionAuto'
import { tsMillis } from '../data/chatKeys'
import { KPI, PageTitle, Card, Cargando, Badge } from '../../components/ui'
import { BarCard, DonutCard } from '../../components/charts'
import { money } from '../../utils/format'
import { useLang } from '../../i18n'

const ENTREGADAS = [E.ENTREGADA, E.LIBERADA, E.CERRADA]
const n = (v) => Number(v) || 0

export default function BulkDashboard() {
  const { t } = useLang()
  const { datos: ordenes, cargando } = useOrdenesConPagos()
  const { datos: clientes } = useColeccion('clients')
  const { datos: carriers } = useColeccion('carriers')
  const { datos: documentos } = useColeccion('documents')
  const { datos: incidencias } = useColeccion('incidents')
  const { datos: presencias } = useColeccion('presence')

  const s = useMemo(() => {
    const entregadas = ordenes.filter((o) => ENTREGADAS.includes(o.estado))
    const enCola = ordenes.filter((o) => [E.CREADA, E.EN_COLA, E.NOTIFICANDO].includes(o.estado))
    const ton = entregadas.reduce((a, o) => a + n(o.pesoReal ?? o.pesoEstimado), 0)
    const ingresos = entregadas.reduce((a, o) => a + n(o.precioCliente), 0)
    const porEstado = {}; for (const o of ordenes) porEstado[o.estado] = (porEstado[o.estado] || 0) + 1
    const porMaterial = {}; for (const o of entregadas) { const m = o.material || '—'; porMaterial[m] = (porMaterial[m] || 0) + n(o.pesoReal ?? o.pesoEstimado) }
    const porChofer = {}; for (const o of entregadas) { const c = o.choferNombre || '—'; porChofer[c] = (porChofer[c] || 0) + 1 }
    const desvios = ordenes.reduce((a, o) => a + ((o.geoEventos || []).length ? 0 : 0), 0)
    const docsAlerta = documentos.map((d) => estadoDocumento(d.vence)).filter((x) => x.estado === 'vencido' || x.estado === 'proximo').length
    const incAbiertas = incidencias.filter((i) => i.estado !== 'resuelta').length
    // Alertas SLA: órdenes que llevan > 3 h sin recoger o sin entregar.
    const now2 = Date.now()
    const slaLista = ordenes
      .map((o) => ({ o, a: alertaOrden(o, now2) }))
      .filter((x) => x.a)
      .map((x) => ({ id: x.o.id, numero: x.o.numero, tipo: x.a.tipo, horas: x.a.horas }))
      .sort((a, b) => b.horas - a.horas)
    // Choferes en línea (presencia viva: heartbeat dentro del TTL).
    const enLineaN = (presencias || []).filter((p) => p.enLinea === true && (now2 - tsMillis(p.heartbeat || p.desde)) <= PRESENCIA_TTL_MS).length
    // Tendencia real: últimos 7 días vs. los 7 anteriores (por fecha de entrega).
    const fEnt = (o) => (o?.hitos?.entrega ? new Date(o.hitos.entrega).getTime() : null)
    const now = Date.now(); const D = 86400000
    const enVentana = (o, a, b) => { const f = fEnt(o); return f != null && (now - f) >= a * D && (now - f) < b * D }
    const cur = entregadas.filter((o) => enVentana(o, 0, 7))
    const prev = entregadas.filter((o) => enVentana(o, 7, 14))
    const suma = (arr, k) => arr.reduce((x, o) => x + n(k(o)), 0)
    const tend = (c, p) => (p > 0 ? (c - p) / p : null)
    const trIngresos = tend(suma(cur, (o) => o.precioCliente), suma(prev, (o) => o.precioCliente))
    const trTon = tend(suma(cur, (o) => o.pesoReal ?? o.pesoEstimado), suma(prev, (o) => o.pesoReal ?? o.pesoEstimado))
    return {
      trIngresos, trTon,
      abiertas: ordenes.filter((o) => ![E.CERRADA, E.CANCELADA].includes(o.estado)).length,
      enCola: enCola.length, entregadas: entregadas.length, ton, ingresos,
      tPromEntrega: tiempoPromedioEntregaMin(entregadas),
      porEstado,
      matData: Object.entries(porMaterial).map(([name, valor]) => ({ name, valor: Math.round(valor) })).sort((a, b) => b.valor - a.valor),
      estadoData: Object.entries(porEstado).map(([k, valor]) => ({ name: t(ORDEN_ESTADO_LABEL[k] || k), valor })),
      rankingChoferes: Object.entries(porChofer).map(([nombre, viajes]) => ({ nombre, viajes })).sort((a, b) => b.viajes - a.viajes).slice(0, 5),
      docsAlerta, incAbiertas, slaLista, enLineaN,
    }
  }, [ordenes, documentos, incidencias, presencias, t])

  if (cargando) return <Cargando texto={t('Cargando panel…')} />

  const hoy = new Date().toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' })
  const fechaTxt = hoy.charAt(0).toUpperCase() + hoy.slice(1)

  return (
    <div>
      <PageTitle right={<span className="text-sm text-slate-400">{fechaTxt}</span>}>{t('Dashboard')}</PageTitle>

      <Grupo titulo={t('Operación')} />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI label={t('Órdenes abiertas')} value={s.abiertas} icon={ClipboardList} accent="navy" />
        <KPI label={t('En cola')} value={s.enCola} icon={ClipboardList} accent="gold" />
        <Link to="/bulk/mapa" className="contents"><KPI label={t('Choferes en línea')} value={s.enLineaN} icon={Truck} accent="green" /></Link>
        <KPI label={t('T. prom. entrega')} value={`${s.tPromEntrega} min`} icon={Timer} accent="navy" sub={t('tomada → entrega')} />
      </div>

      {s.slaLista.length > 0 && (
        <Card className="mb-4 border-l-4 border-l-rose-500 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle size={17} className="text-rose-500" />
            <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{s.slaLista.length} {t('orden(es) fuera de SLA (+3 h)')}</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {s.slaLista.slice(0, 8).map((x) => (
              <Link key={x.id} to={`/bulk/ordenes/${x.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-500/20 dark:text-rose-300">
                {x.numero} · {x.tipo === 'recogida' ? t('sin recoger') : t('sin entregar')} {x.horas}h
              </Link>
            ))}
            {s.slaLista.length > 8 && <Link to="/bulk/ordenes" className="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-600 hover:underline">+{s.slaLista.length - 8} {t('más')}</Link>}
          </div>
        </Card>
      )}

      <Grupo titulo={t('Negocio')} />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI label={t('Ingresos')} value={money(s.ingresos)} icon={DollarSign} accent="blue" trend={s.trIngresos} sub={s.trIngresos != null ? t('vs. 7 días previos') : undefined} />
        <KPI label={t('Toneladas entregadas')} value={Math.round(s.ton)} icon={Weight} accent="green" trend={s.trTon} sub={s.trTon != null ? t('vs. 7 días previos') : undefined} />
        <KPI label={t('Clientes')} value={clientes.length} icon={Building2} accent="slate" />
        <KPI label={t('Transportistas')} value={carriers.length} icon={Truck} accent="slate" />
      </div>

      {(s.docsAlerta > 0 || s.incAbiertas > 0) && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {s.docsAlerta > 0 && <Card className="flex items-center gap-3 border-l-4 border-l-amber-500 p-4"><FileWarning className="text-amber-500" /><div><div className="font-bold text-brand-navy dark:text-slate-100">{s.docsAlerta} {t('documento(s) por vencer')}</div><div className="text-xs text-slate-400">{t('Revisa Documentos y vencimientos.')}</div></div></Card>}
          {s.incAbiertas > 0 && <Card className="flex items-center gap-3 border-l-4 border-l-rose-500 p-4"><AlertTriangle className="text-rose-500" /><div><div className="font-bold text-brand-navy dark:text-slate-100">{s.incAbiertas} {t('incidencia(s) sin resolver')}</div><div className="text-xs text-slate-400">{t('Revisa el Centro de incidencias.')}</div></div></Card>}
        </div>
      )}

      {s.entregadas === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-500/15 text-amber-500"><FlaskConical size={26} /></div>
          <div>
            <div className="text-base font-bold text-brand-navy dark:text-slate-100">{t('Aún no hay datos que mostrar')}</div>
            <p className="mx-auto mt-1 max-w-sm text-sm text-slate-400">{t('Activa el Modo test para llenarlo con un negocio de ejemplo, o crea tu primer Trabajo y genera órdenes.')}</p>
          </div>
          <div className="mt-1 flex flex-wrap justify-center gap-2">
            <Link to="/bulk/demo" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-gold px-4 py-2 text-sm font-semibold text-slate-900 transition hover:brightness-105"><FlaskConical size={15} /> {t('Activar modo test')}</Link>
            <Link to="/bulk/jobs" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"><Layers size={15} /> {t('Crear trabajo')}</Link>
          </div>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-4 lg:grid-cols-2">
            <BarCard title={t('Toneladas por material')} data={s.matData} color="#c9a24b" fmt={(v) => `${v} t`} />
            <DonutCard title={t('Órdenes por estado')} data={s.estadoData} fmt={(v) => v} />
          </div>
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2"><Award size={17} className="text-brand-gold" /><h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Choferes más eficientes (por viajes)')}</h3></div>
            {s.rankingChoferes.length === 0 ? <p className="text-sm text-slate-400">{t('Sin datos.')}</p> : (
              <div className="space-y-1.5">
                {s.rankingChoferes.map((c, i) => (
                  <div key={c.nombre} className="flex items-center gap-2 text-sm">
                    <Badge color={i === 0 ? 'gold' : 'navy'}>#{i + 1}</Badge>
                    <span className="font-medium text-brand-navy dark:text-slate-100">{c.nombre}</span>
                    <span className="ml-auto text-slate-500">{c.viajes} {t('viaje(s)')}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  )
}

function Grupo({ titulo }) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">{titulo}</span>
      <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700/60" />
    </div>
  )
}
