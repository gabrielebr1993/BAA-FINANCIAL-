// ============================================================================
// GANANCIA SEMANAL — "centro de mando" del módulo Gofo (estilo oscuro/neón).
// ----------------------------------------------------------------------------
// Responde la pregunta que el dueño hace siempre: "¿cuánto gané y me alcanzó el
// depósito de Gofo?". Para el periodo/ciudad del filtro global muestra, con DATOS
// REALES (mismas funciones que Financiero/Dashboard):
//   · Ingreso neto de Gofo, nómina de choferes, gastos fijos, GANANCIA y margen.
//   · Cobertura: el depósito de Gofo vs (nómina + gastos) → cuánto te sobra.
//   · Desglose por ciudad (ranking por ganancia) con barra neón.
//   · Tendencia de ganancia por semana (si el rango trae varias).
// Es solo LECTURA: no toca pagos, claims ni facturas. El look oscuro es propio de
// esta pantalla (no cambia el tema del resto de la app).
// ============================================================================
import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../DataContext'
import { gananciaRealDe, desgloseGananciaCiudades, calcularPagos, totalesFiltrados, TODAS } from '../utils/calc'
import { money, num } from '../utils/format'
import { useLang } from '../i18n'

const pct = (x) => `${Math.round((x || 0) * 100)}%`

export default function GananciaSemanal() {
  const { t } = useLang()
  const navigate = useNavigate()
  const { facturaRango, invoicesRango, numSemanas, claims, drivers, managers, selectedCity, ajustesPorChofer, empresaActiva, cargando } = useData()

  // Ganancia por ciudad (una fila por ciudad del periodo), ya ordenada.
  const ciudades = useMemo(
    () => (facturaRango ? desgloseGananciaCiudades(facturaRango, claims, drivers, managers, numSemanas, ajustesPorChofer) : []),
    [facturaRango, claims, drivers, managers, numSemanas, ajustesPorChofer]
  )
  // Números IDÉNTICOS al Dashboard:
  //   · KPI "Ganancia" del Dashboard = Ingreso − nómina de choferes  (gananciaTotal)
  //   · Panel "Ganancia Real" del Dashboard = eso − gastos fijos      (gananciaReal)
  // Se muestran los DOS para que cuadre con cualquiera de los dos del Dashboard.
  const totF = useMemo(() => (facturaRango ? totalesFiltrados(facturaRango, selectedCity) : null), [facturaRango, selectedCity])
  const pagosTot = useMemo(
    () => (facturaRango ? calcularPagos(facturaRango, claims, drivers, selectedCity, ajustesPorChofer) : []),
    [facturaRango, claims, drivers, selectedCity, ajustesPorChofer]
  )
  const gReal = useMemo(
    () => (facturaRango ? gananciaRealDe(facturaRango, claims, drivers, managers, selectedCity, numSemanas, ajustesPorChofer) : null),
    [facturaRango, claims, drivers, managers, selectedCity, numSemanas, ajustesPorChofer]
  )
  const ingreso = totF?.ingreso || 0
  const costoTotal = pagosTot.reduce((a, p) => a + p.totalPagar, 0) // nómina de choferes
  const gananciaTotal = ingreso - costoTotal                        // = KPI "Ganancia" del Dashboard
  const gastosFijos = (gReal?.costoManagers || 0) + (gReal?.gastosTemporales || 0)
  const gananciaReal = gReal?.gananciaReal || 0                     // = panel "Ganancia Real" del Dashboard
  const tot = { ingreso, choferes: costoTotal, managers: gastosFijos, ganancia: gananciaReal }
  const margen = ingreso > 0 ? gananciaReal / ingreso : 0
  const gastosTot = costoTotal + gastosFijos
  const cubre = ingreso >= gastosTot

  // Tendencia de ganancia por SEMANA (agrupando las facturas del rango).
  const porSemana = useMemo(() => {
    const m = {}
    for (const inv of (invoicesRango || [])) {
      const gr = gananciaRealDe(inv, claims, drivers, managers, selectedCity, 1, ajustesPorChofer)
      const g = gr.gananciaReal
      const ing = gr.ingresoNeto
      const fi = inv.fechaInicio?.toDate ? inv.fechaInicio.toDate() : (inv.fechaInicio instanceof Date ? inv.fechaInicio : null)
      const k = inv.semana || inv.id
      if (!m[k]) m[k] = { semana: inv.semana || '—', ganancia: 0, ingreso: 0, fecha: fi }
      m[k].ganancia += g; m[k].ingreso += ing
      if (fi && (!m[k].fecha || fi < m[k].fecha)) m[k].fecha = fi
    }
    return Object.values(m).sort((a, b) => (a.fecha && b.fecha) ? a.fecha - b.fecha : String(a.semana).localeCompare(String(b.semana)))
  }, [invoicesRango, claims, drivers, managers, selectedCity, ajustesPorChofer])

  // Pool de MOVIMIENTOS reales para el log "en vivo" (depósitos, ganancia por
  // ciudad, nómina por chofer, claims). El log los va mostrando en streaming.
  const eventos = useMemo(() => {
    if (!facturaRango) return []
    const out = []
    for (const c of ciudades) {
      out.push({ tag: 'DEPÓSITO', who: c.nombreCiudad, amt: c.ingresoNeto, kind: 'in' })
      out.push({ tag: 'GANANCIA', who: c.nombreCiudad, amt: c.gananciaReal, kind: 'gan', extra: pct(c.margen) })
    }
    try {
      const pagos = calcularPagos(facturaRango, claims, drivers, selectedCity, ajustesPorChofer)
      for (const p of [...pagos].sort((a, b) => b.totalPagar - a.totalPagar).slice(0, 40)) {
        if (p.totalPagar > 0) out.push({ tag: 'NÓMINA', who: p.nombre, amt: -p.totalPagar, kind: 'out', extra: `${num(p.individuales + p.dobles)} pkg` })
        if (p.descuentoClaims > 0) out.push({ tag: 'CLAIM', who: p.nombre, amt: -p.descuentoClaims, kind: 'claim' })
      }
    } catch { /* noop */ }
    return out
  }, [facturaRango, ciudades, claims, drivers, selectedCity, ajustesPorChofer])

  const periodoLabel = selectedCity && selectedCity !== TODAS
    ? (ciudades[0]?.nombreCiudad || selectedCity)
    : t('Todas las ciudades')

  // Diferencia entre la suma por ciudad y el total real = gastos fijos SIN ciudad
  // asignada (se restan del total pero no se cargan a ninguna ciudad).
  const sumCiudades = ciudades.reduce((a, c) => a + c.gananciaReal, 0)
  const gastosSinCiudad = sumCiudades - tot.ganancia
  const maxGan = Math.max(1, ...ciudades.map((c) => Math.abs(c.gananciaReal)))

  return (
    <div className="gs-root">
      <style>{CSS}</style>

      {/* Barra superior */}
      <div className="gs-top">
        <div className="gs-title">
          <span className="gs-live"><i /> LIVE</span>
          <h1>GANANCIA · GOFO</h1>
          <div className="gs-sub">{empresaActiva?.nombre || 'MilePay'} · {periodoLabel} · {num(numSemanas)} {numSemanas === 1 ? t('semana') : t('semanas')}</div>
        </div>
        <div className="gs-margen">
          <div className="gs-margen-n">{pct(margen)}</div>
          <div className="gs-margen-l">{t('margen')}</div>
        </div>
      </div>

      {cargando ? (
        <div className="gs-empty">{t('Cargando…')}</div>
      ) : !facturaRango || tot.ingreso === 0 ? (
        <div className="gs-empty">{t('No hay datos de Gofo en el periodo/ciudad del filtro. Cambia el filtro arriba o carga una factura.')}</div>
      ) : (
        <>
          {/* KPIs principales */}
          <div className="gs-kpis">
            <Tile c="cyan" k={t('Ingreso Gofo')} v={money(tot.ingreso)} s={t('depósito neto')} />
            <Tile c="pink" k={t('Nómina choferes')} v={'−' + money(tot.choferes)} s={t('lo que pagas')} />
            <Tile c="orange" k={t('Gastos fijos')} v={'−' + money(tot.managers)} s={t('managers + fijos')} />
            <Tile c="green" big k={t('Ganancia real')} v={money(tot.ganancia)} s={pct(margen) + ' ' + t('de margen')} />
          </div>

          {/* Aclaración: la ganancia REAL y, de referencia, el KPI del Dashboard. */}
          <div className="gs-aclara">
            <b className="gs-gold">{t('Ganancia real')}</b> {t('= Ingreso − nómina − gastos fijos')} ({money(gastosFijos)}) = <b className="gs-gold">{money(gananciaReal)}</b> · {t('igual al panel «Ganancia Real» de tu Dashboard. El KPI «Ganancia» (sin restar gastos) sería')} {money(gananciaTotal)}.
          </div>

          {/* Cobertura: ¿alcanzó el depósito? */}
          <div className="gs-panel gs-cover">
            <div className="gs-panel-h">
              <span>{t('¿Alcanzó el depósito de Gofo?')}</span>
              <span className={cubre ? 'gs-ok' : 'gs-bad'}>{cubre ? `✓ ${t('SÍ · ganancia real')} ${money(gananciaReal)}` : `✕ ${t('NO · faltan')} ${money(gastosTot - ingreso)}`}</span>
            </div>
            <div className="gs-bar" role="img" aria-label={t('Reparto del ingreso')}>
              <span className="gs-seg pink" style={{ width: pctW(costoTotal, ingreso) }} title={t('Nómina')} />
              <span className="gs-seg orange" style={{ width: pctW(gastosFijos, ingreso) }} title={t('Gastos fijos')} />
              <span className="gs-seg green" style={{ width: pctW(Math.max(0, gananciaReal), ingreso) }} title={t('Ganancia real')} />
            </div>
            <div className="gs-bar-leg">
              <span><i className="pink" /> {t('Nómina')} {money(costoTotal)}</span>
              <span><i className="orange" /> {t('Gastos fijos')} {money(gastosFijos)}</span>
              <span><i className="green" /> {t('Ganancia real')} {money(gananciaReal)}</span>
            </div>
          </div>

          <div className="gs-grid2">
            {/* Ganancia por ciudad */}
            <div className="gs-panel">
              <div className="gs-panel-h"><span>{t('Ganancia por ciudad')}</span><span className="gs-faint">{num(ciudades.length)} {t('ciudades')}</span></div>
              <div className="gs-cities">
                {ciudades.map((c) => (
                  <button key={c.code} className="gs-city" onClick={() => navigate('/financiero')} title={t('Ver en Financiero')}>
                    <div className="gs-city-top">
                      <span className="gs-city-name">{c.nombreCiudad}<i className="gs-code">{c.code}</i></span>
                      <span className={'gs-city-g ' + (c.gananciaReal >= 0 ? 'pos' : 'neg')}>{money(c.gananciaReal)}</span>
                    </div>
                    <div className="gs-city-bar"><span style={{ width: pctW(Math.abs(c.gananciaReal), maxGan), background: c.gananciaReal >= 0 ? 'var(--gs-green)' : 'var(--gs-red)' }} /></div>
                    <div className="gs-city-sub">
                      <span>{t('ingreso')} {money(c.ingresoNeto)}</span>
                      <span>{t('nómina')} {money(c.costoChoferes)}</span>
                      <span className="gs-city-m">{pct(c.margen)}</span>
                    </div>
                  </button>
                ))}
              </div>
              {Math.abs(gastosSinCiudad) > 1 && (
                <div className="gs-sincity">{t('Gastos fijos sin ciudad asignada')}: <b>−{money(gastosSinCiudad)}</b> · {t('se restan del total pero no se cargan a una ciudad')}</div>
              )}
            </div>

            {/* Tendencia por semana */}
            <div className="gs-panel">
              <div className="gs-panel-h"><span>{t('Ganancia por semana')}</span><span className="gs-faint">{num(porSemana.length)}</span></div>
              {porSemana.length <= 1 ? (
                <div className="gs-onew">
                  <div className="gs-onew-n">{money(tot.ganancia)}</div>
                  <div className="gs-faint">{t('Elige un rango de varias semanas arriba para ver la tendencia.')}</div>
                </div>
              ) : (
                <AreaTrend data={porSemana} money={money} />
              )}
            </div>
          </div>

          <LiveLog eventos={eventos} t={t} />

          <div className="gs-foot">{t('Solo lectura. Mismos cálculos que Financiero. Toca una ciudad para ver el detalle.')}</div>
        </>
      )}
    </div>
  )
}

function Tile({ c, k, v, s, big }) {
  return (
    <div className={'gs-tile ' + c + (big ? ' big' : '')}>
      <div className="gs-tile-k">{k}</div>
      <div className="gs-tile-v">{v}</div>
      <div className="gs-tile-s">{s}</div>
    </div>
  )
}

const pctW = (part, whole) => `${Math.max(0, Math.min(100, whole > 0 ? (part / whole) * 100 : 0))}%`

// ── Log de movimientos EN VIVO (streaming de eventos reales) ──
function LiveLog({ eventos, t }) {
  const [lines, setLines] = useState([])
  const idx = useRef(0)
  useEffect(() => {
    if (!eventos.length) { setLines([]); return }
    const hora = () => new Date().toLocaleTimeString('es-MX', { hour12: false })
    const mk = (e) => ({ ...e, ts: hora(), id: Math.random().toString(36).slice(2) })
    setLines(eventos.slice(0, 7).map(mk).reverse())
    idx.current = 7 % eventos.length
    const iv = setInterval(() => {
      const e = eventos[idx.current % eventos.length]; idx.current++
      setLines((prev) => [mk(e), ...prev].slice(0, 16))
    }, 1500)
    return () => clearInterval(iv)
  }, [eventos])
  if (!eventos.length) return null
  const sign = (n) => (n >= 0 ? '+' : '−') + '$' + Math.abs(Math.round(n)).toLocaleString('en-US')
  return (
    <div className="gs-panel gs-log">
      <div className="gs-panel-h"><span className="gs-logtitle"><i /> {t('Registro en vivo')}</span><span className="gs-faint">{t('movimientos reales')}</span></div>
      <div className="gs-logbox">
        {lines.map((l) => (
          <div key={l.id} className="gs-logline">
            <span className="gs-lt">{l.ts}</span>
            <span className={'gs-ltag ' + l.kind}>{l.tag}</span>
            <span className="gs-lwho">{l.who}</span>
            {l.extra && <span className="gs-lex">· {l.extra}</span>}
            <span className={'gs-lamt ' + (l.amt >= 0 ? 'pos' : 'neg')}>{sign(l.amt)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Gráfica de área estilo "trading" (ganancia por semana, con glow) ──
function AreaTrend({ data, money }) {
  const W = 560, H = 210, mL = 58, mR = 16, mT = 16, mB = 30
  const x0 = mL, x1 = W - mR, y0 = mT, y1 = H - mB
  const vals = data.map((d) => d.ganancia)
  const vMax = Math.max(0, ...vals), vMin = Math.min(0, ...vals)
  const pad = (vMax - vMin || 1) * 0.15
  const hi = vMax + pad, lo = vMin - pad
  const X = (i) => data.length <= 1 ? (x0 + x1) / 2 : x0 + (i / (data.length - 1)) * (x1 - x0)
  const Y = (v) => y0 + (hi - v) / (hi - lo) * (y1 - y0)
  const yZero = Y(0)
  const pts = data.map((d, i) => [X(i), Y(d.ganancia)])
  const linePath = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const areaPath = `${linePath} L ${pts[pts.length - 1][0].toFixed(1)} ${yZero} L ${pts[0][0].toFixed(1)} ${yZero} Z`
  const money0 = (v) => '$' + Math.round(v).toLocaleString('en-US')
  return (
    <svg className="gs-area" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Ganancia por semana">
      <defs>
        <linearGradient id="gsfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--gs-gold)" stopOpacity="0.38" />
          <stop offset="100%" stopColor="var(--gs-gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[hi, (hi + lo) / 2, 0, lo].filter((v, i, a) => a.indexOf(v) === i).map((v, i) => (
        <g key={i}>
          <line x1={x0} y1={Y(v)} x2={x1} y2={Y(v)} stroke="var(--gs-line)" strokeWidth={v === 0 ? 1.4 : 1} strokeDasharray={v === 0 ? '' : '3 5'} />
          <text x={x0 - 9} y={Y(v) + 4} textAnchor="end" fill="var(--gs-faint)" fontSize="10.5" fontFamily="IBM Plex Mono, monospace">{money0(v)}</text>
        </g>
      ))}
      <path d={areaPath} fill="url(#gsfill)" />
      <path d={linePath} fill="none" stroke="var(--gs-gold)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 5 : 3.2} fill="var(--gs-gold)" stroke="var(--gs-card)" strokeWidth="1.5">
            <title>{data[i].semana}: {money(data[i].ganancia)}</title>
          </circle>
          <text x={p[0]} y={y1 + 18} textAnchor="middle" fill="var(--gs-faint)" fontSize="9.5" fontFamily="Hanken Grotesk, sans-serif">{data[i].semana}</text>
        </g>
      ))}
    </svg>
  )
}

const CSS = `
/* Tema CLARO como el resto del sistema (Dashboard): tarjetas blancas, texto
   navy, acentos dorados, sombras suaves. Modo oscuro vía .dark del sistema. */
.gs-root{
  --gs-card:#ffffff;--gs-card2:#f6f7f9;--gs-line:#e3e6ec;--gs-bg:#eef1f5;
  --gs-ink:#13233f;--gs-mut:#6b7280;--gs-faint:#9aa4b2;
  --gs-gold:#c9a24b;--gs-cyan:#2b4c8c;--gs-pink:#64748b;--gs-orange:#d9822b;--gs-green:#2e9e6b;--gs-red:#e0533d;
  --gs-shadow:0 1px 2px rgba(19,35,63,.04),0 2px 6px rgba(19,35,63,.06);
  color:var(--gs-ink);position:relative;font-family:ui-sans-serif,system-ui,sans-serif}
.dark .gs-root{
  --gs-card:#1b2b45;--gs-card2:#13233f;--gs-line:#2a3b58;--gs-bg:#0f1d35;
  --gs-ink:#e8eef8;--gs-mut:#9fb0cc;--gs-faint:#6b7f9e;
  --gs-cyan:#6f9fd8;--gs-pink:#8aa0c4;--gs-green:#3fbd86;
  --gs-shadow:0 1px 2px rgba(0,0,0,.25),0 2px 8px rgba(0,0,0,.3)}
@media (prefers-reduced-motion:reduce){.gs-live i,.gs-logtitle i{animation:none}}
.gs-root .mono,.gs-tile-v,.gs-city-g,.gs-margen-n,.gs-onew-n,.gs-tval{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
.gs-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.gs-live{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--gs-green)}
.gs-live i{width:7px;height:7px;border-radius:50%;background:var(--gs-green);animation:gspulse 1.6s infinite}
@keyframes gspulse{0%,100%{opacity:1}50%{opacity:.25}}
.gs-title h1{margin:4px 0 2px;font-size:24px;font-weight:800;letter-spacing:-.01em;color:var(--gs-ink)}
.gs-sub{font-size:12.5px;color:var(--gs-mut);font-weight:500}
.gs-margen{text-align:right}
.gs-margen-n{font-size:30px;font-weight:800;color:var(--gs-gold);line-height:1}
.gs-margen-l{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--gs-faint);margin-top:3px}
.gs-empty{padding:48px 18px;text-align:center;color:var(--gs-mut);font-size:14px}
.gs-aclara{font-size:12px;color:var(--gs-mut);background:rgba(201,162,75,.08);border:1px solid var(--gs-line);border-radius:10px;padding:9px 12px;margin-bottom:14px;line-height:1.55}
.gs-aclara b{color:var(--gs-ink)} .gs-gold{color:var(--gs-gold)!important;font-family:"IBM Plex Mono",monospace}
.gs-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
.gs-tile{background:var(--gs-card);border:1px solid var(--gs-line);border-radius:14px;padding:14px 15px;position:relative;overflow:hidden;box-shadow:var(--gs-shadow)}
.gs-tile::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px}
.gs-tile.cyan::before{background:var(--gs-cyan)}
.gs-tile.pink::before{background:var(--gs-pink)}
.gs-tile.orange::before{background:var(--gs-orange)}
.gs-tile.green::before{background:var(--gs-green)}
.gs-tile.big{grid-column:span 1;background:linear-gradient(180deg,rgba(46,158,107,.08),var(--gs-card))}
.gs-tile-k{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--gs-mut);font-weight:600}
.gs-tile-v{font-size:22px;font-weight:700;margin-top:7px;letter-spacing:-.01em}
.gs-tile.big .gs-tile-v{font-size:27px;color:var(--gs-green)}
.gs-tile.cyan .gs-tile-v{color:var(--gs-cyan)} .gs-tile.pink .gs-tile-v{color:var(--gs-pink)} .gs-tile.orange .gs-tile-v{color:var(--gs-orange)}
.gs-tile-s{font-size:11px;color:var(--gs-faint);margin-top:3px;font-weight:500}
.gs-panel{position:relative;background:var(--gs-card);border:1px solid var(--gs-line);border-radius:14px;padding:16px 17px;margin-bottom:14px;box-shadow:var(--gs-shadow)}
.gs-panel-h{display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;font-weight:700;margin-bottom:12px;color:var(--gs-ink)}
.gs-faint{color:var(--gs-faint);font-weight:500;font-size:12px}
.gs-ok{color:var(--gs-green);font-weight:700;font-size:12.5px} .gs-bad{color:var(--gs-red);font-weight:700;font-size:12.5px}
.gs-bar{display:flex;height:16px;border-radius:8px;overflow:hidden;background:var(--gs-card2);gap:2px}
.gs-seg{display:block;min-width:0}
.gs-seg.pink{background:var(--gs-pink)} .gs-seg.orange{background:var(--gs-orange)} .gs-seg.green{background:var(--gs-green)}
.gs-bar-leg{display:flex;gap:16px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--gs-mut);font-family:"IBM Plex Mono",monospace}
.gs-bar-leg i,.gs-bar-leg .pink{width:9px;height:9px;border-radius:2px;display:inline-block;margin-right:5px}
.gs-bar-leg .pink{background:var(--gs-pink)} .gs-bar-leg .orange{background:var(--gs-orange)} .gs-bar-leg .green{background:var(--gs-green)}
.gs-grid2{display:grid;grid-template-columns:1.3fr 1fr;gap:14px}
.gs-cities{display:flex;flex-direction:column;gap:9px;max-height:360px;overflow-y:auto}
.gs-city{display:block;width:100%;text-align:left;background:var(--gs-card2);border:1px solid var(--gs-line);border-radius:11px;padding:10px 12px;cursor:pointer;transition:border-color .15s,transform .05s}
.gs-city:hover{border-color:var(--gs-gold)} .gs-city:active{transform:translateY(1px)}
.gs-city-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.gs-city-name{font-weight:700;font-size:13.5px;color:var(--gs-ink)}
.gs-code{font-style:normal;font-size:10px;font-weight:700;color:var(--gs-cyan);background:rgba(43,76,140,.1);padding:1px 6px;border-radius:999px;margin-left:7px;font-family:"IBM Plex Mono",monospace}
.gs-city-g{font-size:14px;font-weight:700}
.gs-city-g.pos{color:var(--gs-green)} .gs-city-g.neg{color:var(--gs-red)}
.gs-city-bar{height:6px;border-radius:4px;background:var(--gs-bg);margin:8px 0 7px;overflow:hidden}
.gs-city-bar span{display:block;height:100%;border-radius:4px}
.gs-city-sub{display:flex;gap:14px;font-size:11.5px;color:var(--gs-mut);font-family:"IBM Plex Mono",monospace}
.gs-city-m{margin-left:auto;color:var(--gs-gold);font-weight:700}
.gs-sincity{margin-top:10px;font-size:11.5px;color:var(--gs-mut);border-top:1px dashed var(--gs-line);padding-top:9px}
.gs-sincity b{color:var(--gs-orange);font-family:"IBM Plex Mono",monospace}
.gs-onew{display:flex;flex-direction:column;gap:8px;align-items:flex-start;justify-content:center;min-height:120px}
.gs-onew-n{font-size:30px;font-weight:800;color:var(--gs-green)}
.gs-trend{display:flex;align-items:flex-end;gap:8px;height:200px;padding-top:6px}
.gs-tcol{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%}
.gs-tbarwrap{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center}
.gs-tbar{display:block;width:70%;max-width:38px;border-radius:5px 5px 0 0;min-height:3px}
.gs-tval{font-size:10.5px;color:var(--gs-mut);font-family:"IBM Plex Mono",monospace}
.gs-tlbl{font-size:9.5px;color:var(--gs-faint);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.gs-area{display:block;width:100%;height:auto;overflow:visible;margin-top:4px}
.gs-log{margin-top:0}
.gs-logtitle{display:inline-flex;align-items:center;gap:7px;color:var(--gs-green)}
.gs-logtitle i{width:7px;height:7px;border-radius:50%;background:var(--gs-green);animation:gspulse 1.4s infinite}
.gs-logbox{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;background:var(--gs-card2);border:1px solid var(--gs-line);border-radius:10px;padding:10px 12px;max-height:270px;overflow:hidden;display:flex;flex-direction:column;gap:3px}
.gs-logline{display:flex;align-items:center;gap:9px;padding:3px 0;white-space:nowrap;animation:gsin .35s ease}
@keyframes gsin{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.gs-lt{color:var(--gs-faint);font-size:11px;flex:0 0 auto}
.gs-ltag{font-size:10px;font-weight:700;letter-spacing:.05em;padding:2px 7px;border-radius:5px;flex:0 0 auto}
.gs-ltag.in{color:var(--gs-cyan);background:rgba(43,76,140,.12)}
.gs-ltag.gan{color:#9a7b1f;background:rgba(201,162,75,.16)}
.dark .gs-ltag.gan{color:var(--gs-gold)}
.gs-ltag.out{color:var(--gs-pink);background:rgba(100,116,139,.14)}
.gs-ltag.claim{color:var(--gs-red);background:rgba(224,83,61,.13)}
.gs-lwho{color:var(--gs-ink);overflow:hidden;text-overflow:ellipsis;min-width:0}
.gs-lex{color:var(--gs-faint);font-size:11px;flex:0 0 auto}
.gs-lamt{margin-left:auto;font-weight:700;flex:0 0 auto}
.gs-lamt.pos{color:var(--gs-green)} .gs-lamt.neg{color:var(--gs-pink)}
.gs-foot{font-size:11.5px;color:var(--gs-faint);text-align:center;margin-top:12px}
@media (max-width:820px){.gs-kpis{grid-template-columns:repeat(2,1fr)}.gs-grid2{grid-template-columns:1fr}}
@media (max-width:480px){.gs-title h1{font-size:20px}.gs-margen-n{font-size:24px}}
`
