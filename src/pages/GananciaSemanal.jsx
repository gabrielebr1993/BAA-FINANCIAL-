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
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../DataContext'
import { gananciaRealDe, desgloseGananciaCiudades, TODAS } from '../utils/calc'
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
  // Totales = suma de las ciudades (consistente con el desglose).
  const tot = useMemo(() => ciudades.reduce((a, c) => ({
    ingreso: a.ingreso + c.ingresoNeto,
    choferes: a.choferes + c.costoChoferes,
    managers: a.managers + c.costoManagers,
    ganancia: a.ganancia + c.gananciaReal,
  }), { ingreso: 0, choferes: 0, managers: 0, ganancia: 0 }), [ciudades])
  const margen = tot.ingreso > 0 ? tot.ganancia / tot.ingreso : 0
  const gastosTot = tot.choferes + tot.managers
  const cubre = tot.ingreso >= gastosTot

  // Tendencia de ganancia por SEMANA (agrupando las facturas del rango).
  const porSemana = useMemo(() => {
    const m = {}
    for (const inv of (invoicesRango || [])) {
      const filas = desgloseGananciaCiudades(inv, claims, drivers, managers, 1, ajustesPorChofer)
      const g = filas.reduce((a, c) => a + c.gananciaReal, 0)
      const ing = filas.reduce((a, c) => a + c.ingresoNeto, 0)
      const fi = inv.fechaInicio?.toDate ? inv.fechaInicio.toDate() : (inv.fechaInicio instanceof Date ? inv.fechaInicio : null)
      const k = inv.semana || inv.id
      if (!m[k]) m[k] = { semana: inv.semana || '—', ganancia: 0, ingreso: 0, fecha: fi }
      m[k].ganancia += g; m[k].ingreso += ing
      if (fi && (!m[k].fecha || fi < m[k].fecha)) m[k].fecha = fi
    }
    return Object.values(m).sort((a, b) => (a.fecha && b.fecha) ? a.fecha - b.fecha : String(a.semana).localeCompare(String(b.semana)))
  }, [invoicesRango, claims, drivers, managers, ajustesPorChofer])

  const periodoLabel = selectedCity && selectedCity !== TODAS
    ? (ciudades[0]?.nombreCiudad || selectedCity)
    : t('Todas las ciudades')

  const maxGan = Math.max(1, ...ciudades.map((c) => Math.abs(c.gananciaReal)))
  const maxSem = Math.max(1, ...porSemana.map((s) => Math.abs(s.ganancia)))

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
            <Tile c="green" big k={t('Ganancia')} v={money(tot.ganancia)} s={pct(margen) + ' ' + t('de margen')} />
          </div>

          {/* Cobertura: ¿alcanzó el depósito? */}
          <div className="gs-panel gs-cover">
            <div className="gs-panel-h">
              <span>{t('¿Alcanzó el depósito de Gofo?')}</span>
              <span className={cubre ? 'gs-ok' : 'gs-bad'}>{cubre ? `✓ ${t('SÍ · te sobran')} ${money(tot.ganancia)}` : `✕ ${t('NO · faltan')} ${money(gastosTot - tot.ingreso)}`}</span>
            </div>
            <div className="gs-bar" role="img" aria-label={t('Reparto del ingreso')}>
              <span className="gs-seg pink" style={{ width: pctW(tot.choferes, tot.ingreso) }} title={t('Nómina')} />
              <span className="gs-seg orange" style={{ width: pctW(tot.managers, tot.ingreso) }} title={t('Gastos')} />
              <span className="gs-seg green" style={{ width: pctW(Math.max(0, tot.ganancia), tot.ingreso) }} title={t('Ganancia')} />
            </div>
            <div className="gs-bar-leg">
              <span><i className="pink" /> {t('Nómina')} {money(tot.choferes)}</span>
              <span><i className="orange" /> {t('Gastos')} {money(tot.managers)}</span>
              <span><i className="green" /> {t('Ganancia')} {money(tot.ganancia)}</span>
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
                <div className="gs-trend">
                  {porSemana.map((s) => (
                    <div key={s.semana} className="gs-tcol" title={`${s.semana}: ${money(s.ganancia)}`}>
                      <div className="gs-tbarwrap">
                        <span className="gs-tbar" style={{ height: pctW(Math.abs(s.ganancia), maxSem), background: s.ganancia >= 0 ? 'var(--gs-green)' : 'var(--gs-red)' }} />
                      </div>
                      <div className="gs-tval">{money(s.ganancia).replace('$', '')}</div>
                      <div className="gs-tlbl">{s.semana}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

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

const CSS = `
.gs-root{--gs-bg:#070b14;--gs-card:#0d1424;--gs-card2:#111a2e;--gs-line:#1b2740;--gs-ink:#e7eefc;--gs-mut:#7f93b8;--gs-faint:#52637f;
  --gs-cyan:#22d3ee;--gs-pink:#f472d0;--gs-orange:#fb923c;--gs-green:#34e5a4;--gs-red:#fb6a6a;--gs-gold:#e7c25a;
  background:var(--gs-bg);color:var(--gs-ink);border-radius:18px;padding:20px;margin:-4px 0 8px;
  font-family:ui-sans-serif,system-ui,sans-serif;box-shadow:inset 0 0 0 1px var(--gs-line),0 20px 60px rgba(0,0,0,.4);
  background-image:radial-gradient(1200px 400px at 15% -10%,rgba(34,211,238,.10),transparent 60%),radial-gradient(900px 400px at 110% 0%,rgba(244,114,208,.10),transparent 55%);}
.gs-root .mono,.gs-tile-v,.gs-city-g,.gs-margen-n,.gs-onew-n,.gs-tval{font-family:"IBM Plex Mono",ui-monospace,monospace;font-variant-numeric:tabular-nums}
.gs-top{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px}
.gs-live{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:800;letter-spacing:.14em;color:var(--gs-green)}
.gs-live i{width:7px;height:7px;border-radius:50%;background:var(--gs-green);box-shadow:0 0 8px var(--gs-green);animation:gspulse 1.6s infinite}
@keyframes gspulse{0%,100%{opacity:1}50%{opacity:.25}}
.gs-title h1{margin:4px 0 2px;font-size:24px;font-weight:800;letter-spacing:.02em;background:linear-gradient(90deg,var(--gs-cyan),var(--gs-ink));-webkit-background-clip:text;background-clip:text;color:transparent}
.gs-sub{font-size:12.5px;color:var(--gs-mut);font-weight:500}
.gs-margen{text-align:right}
.gs-margen-n{font-size:30px;font-weight:800;color:var(--gs-gold);text-shadow:0 0 18px rgba(231,194,90,.35);line-height:1}
.gs-margen-l{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--gs-faint);margin-top:3px}
.gs-empty{padding:48px 18px;text-align:center;color:var(--gs-mut);font-size:14px}
.gs-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}
.gs-tile{background:var(--gs-card);border:1px solid var(--gs-line);border-radius:14px;padding:14px 15px;position:relative;overflow:hidden}
.gs-tile::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px}
.gs-tile.cyan::before{background:var(--gs-cyan);box-shadow:0 0 14px var(--gs-cyan)}
.gs-tile.pink::before{background:var(--gs-pink);box-shadow:0 0 14px var(--gs-pink)}
.gs-tile.orange::before{background:var(--gs-orange);box-shadow:0 0 14px var(--gs-orange)}
.gs-tile.green::before{background:var(--gs-green);box-shadow:0 0 14px var(--gs-green)}
.gs-tile.big{grid-column:span 1;background:linear-gradient(180deg,rgba(52,229,164,.09),var(--gs-card))}
.gs-tile-k{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--gs-mut);font-weight:600}
.gs-tile-v{font-size:22px;font-weight:700;margin-top:7px;letter-spacing:-.01em}
.gs-tile.big .gs-tile-v{font-size:27px;color:var(--gs-green);text-shadow:0 0 16px rgba(52,229,164,.3)}
.gs-tile.cyan .gs-tile-v{color:var(--gs-cyan)} .gs-tile.pink .gs-tile-v{color:var(--gs-pink)} .gs-tile.orange .gs-tile-v{color:var(--gs-orange)}
.gs-tile-s{font-size:11px;color:var(--gs-faint);margin-top:3px;font-weight:500}
.gs-panel{background:var(--gs-card);border:1px solid var(--gs-line);border-radius:14px;padding:16px 17px;margin-bottom:14px}
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
.gs-city:hover{border-color:var(--gs-cyan)} .gs-city:active{transform:translateY(1px)}
.gs-city-top{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.gs-city-name{font-weight:700;font-size:13.5px;color:var(--gs-ink)}
.gs-code{font-style:normal;font-size:10px;font-weight:700;color:var(--gs-cyan);background:rgba(34,211,238,.12);padding:1px 6px;border-radius:999px;margin-left:7px;font-family:"IBM Plex Mono",monospace}
.gs-city-g{font-size:14px;font-weight:700}
.gs-city-g.pos{color:var(--gs-green)} .gs-city-g.neg{color:var(--gs-red)}
.gs-city-bar{height:6px;border-radius:4px;background:var(--gs-bg);margin:8px 0 7px;overflow:hidden}
.gs-city-bar span{display:block;height:100%;border-radius:4px}
.gs-city-sub{display:flex;gap:14px;font-size:11.5px;color:var(--gs-mut);font-family:"IBM Plex Mono",monospace}
.gs-city-m{margin-left:auto;color:var(--gs-gold);font-weight:700}
.gs-onew{display:flex;flex-direction:column;gap:8px;align-items:flex-start;justify-content:center;min-height:120px}
.gs-onew-n{font-size:30px;font-weight:800;color:var(--gs-green);text-shadow:0 0 16px rgba(52,229,164,.3)}
.gs-trend{display:flex;align-items:flex-end;gap:8px;height:200px;padding-top:6px}
.gs-tcol{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%}
.gs-tbarwrap{flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center}
.gs-tbar{display:block;width:70%;max-width:38px;border-radius:5px 5px 0 0;min-height:3px;box-shadow:0 0 12px rgba(52,229,164,.25)}
.gs-tval{font-size:10.5px;color:var(--gs-mut);font-family:"IBM Plex Mono",monospace}
.gs-tlbl{font-size:9.5px;color:var(--gs-faint);text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.gs-foot{font-size:11.5px;color:var(--gs-faint);text-align:center;margin-top:12px}
@media (max-width:820px){.gs-kpis{grid-template-columns:repeat(2,1fr)}.gs-grid2{grid-template-columns:1fr}}
@media (max-width:480px){.gs-title h1{font-size:20px}.gs-margen-n{font-size:24px}}
`
