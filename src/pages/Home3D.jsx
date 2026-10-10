// ============================================================================
// HOME PÚBLICO de MilePay (portada del sitio en www.milepay.io).
//
// Estructura (pedida por el dueño):
//  1) HERO INMERSIVO a pantalla completa: la escena 3D ocupa todo el ancho y
//     el texto flota encima en una tarjeta de vidrio. Cámara libre + visita
//     al almacén (ver home3d/escenaMilePay.js). En modo oscuro es nocturna.
//  2) DOS SECCIONES SEPARADAS y claramente diferenciadas para que no se
//     confundan los negocios: 📦 Paquetería última milla (navy) y
//     🚛 MilePay Freight / materiales a granel (dorado).
//  3) "Cómo funciona" (3 pasos) + pie de página — sin espacios en blanco.
//
// Sin marcas de carriers en el sitio público (se eligen al iniciar sesión).
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { montarEscenaMilePay } from './home3d/escenaMilePay'

const CSS = `
.h3d{--bg:#eef1f6;--fg:#13233f;--muted:#5b6a84;--gold:#c9a24b;--navy:#13233f;--verde:#149d80;--card:rgba(255,255,255,.72);--card-borde:rgba(255,255,255,.9);--panel:#ffffff;
  background:var(--bg);color:var(--fg);min-height:100vh;font:15px/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;position:relative;overflow-x:hidden}
/* Aurora de color detrás de todas las secciones: nada queda plano ni vacío. */
.h3d .aurora{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
.h3d .aurora span{position:absolute;border-radius:50%;filter:blur(110px);opacity:.26;will-change:transform}
.h3d .au1{width:48vw;height:48vw;background:#c9a24b;top:38%;left:-16vw;animation:h3dflota 30s ease-in-out infinite alternate}
.h3d .au2{width:44vw;height:44vw;background:#3d5a80;bottom:-14vw;right:-12vw;animation:h3dflota 36s ease-in-out infinite alternate-reverse}
.h3d .au3{width:34vw;height:34vw;background:#149d80;top:66%;left:52%;animation:h3dflota 42s ease-in-out infinite alternate}
@keyframes h3dflota{to{transform:translate(7vw,-5vh) scale(1.12)}}
.h3d>section,.h3d>footer{position:relative;z-index:1}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) .h3d{--bg:#0b1322;--fg:#e8edf6;--muted:#9aa8c0;--card:rgba(21,34,58,.66);--card-borde:rgba(255,255,255,.08);--panel:#121e35}
}
:root[data-theme="dark"] .h3d{--bg:#0b1322;--fg:#e8edf6;--muted:#9aa8c0;--card:rgba(21,34,58,.66);--card-borde:rgba(255,255,255,.08);--panel:#121e35}
.h3d *{box-sizing:border-box}
.h3d .marco{max-width:1220px;margin:0 auto;padding-inline:16px}

/* ── Nav flotante sobre el héroe ── */
.h3d .nav{position:absolute;top:0;left:0;right:0;z-index:5;display:flex;align-items:center;gap:18px;padding:16px 20px;flex-wrap:wrap}
.h3d .logo{font-size:20px;font-weight:800;letter-spacing:-.02em;cursor:pointer;color:#fff;text-shadow:0 1px 10px rgba(0,0,0,.25)}
.h3d .logo b{color:var(--gold)}
.h3d .nav a{color:rgba(255,255,255,.85);text-decoration:none;font-weight:600;font-size:13.5px;cursor:pointer;text-shadow:0 1px 8px rgba(0,0,0,.3)}
.h3d .nav a:hover{color:#fff}
.h3d .sep{margin-left:auto;display:flex;gap:10px;align-items:center}
.h3d .btn{display:inline-flex;align-items:center;gap:8px;border-radius:12px;padding:11px 18px;font-weight:700;font-size:14px;text-decoration:none;transition:transform .2s;border:0;cursor:pointer;font-family:inherit}
.h3d .btn:hover{transform:translateY(-2px)}
.h3d .btn-oro{background:var(--gold);color:#13233f;box-shadow:0 8px 20px rgba(201,162,75,.4)}
.h3d .btn-blanco{background:rgba(255,255,255,.14);color:#fff;border:1.5px solid rgba(255,255,255,.4);backdrop-filter:blur(8px)}
.h3d .btn-navy{background:var(--navy);color:#fff;box-shadow:0 8px 20px rgba(19,35,63,.3)}
.h3d .btn-linea{border:1.5px solid var(--muted);color:var(--fg);background:transparent}

/* ── HERO inmersivo a pantalla completa ── */
.h3d .heroe{position:relative;height:100svh;min-height:580px;overflow:hidden;z-index:1}
.h3d .heroe canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;cursor:grab;touch-action:none}
.h3d .heroe.arrastrando canvas{cursor:grabbing}
.h3d .velo{position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(10,18,34,.55) 0%,rgba(10,18,34,.22) 38%,transparent 60%)}
.h3d .velo-abajo{position:absolute;left:0;right:0;bottom:0;height:120px;pointer-events:none;background:linear-gradient(180deg,transparent,var(--bg))}
.h3d .vidrio{position:absolute;left:4%;top:50%;transform:translateY(-50%);z-index:4;max-width:520px;
  background:rgba(13,22,40,.55);border:1px solid rgba(255,255,255,.14);border-radius:24px;padding:28px;
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 24px 70px rgba(0,0,0,.35);color:#fff}
.h3d .vidrio h1{font-size:clamp(28px,3.6vw,44px);line-height:1.07;letter-spacing:-.03em;margin:0 0 12px;text-wrap:balance}
.h3d .vidrio h1 em{font-style:normal;color:var(--gold)}
.h3d .vidrio p{color:rgba(255,255,255,.82);margin:0 0 16px;font-size:14.5px}
.h3d .migas{display:flex;gap:8px;margin:0 0 18px;flex-wrap:wrap}
.h3d .miga{font-size:11.5px;font-weight:800;padding:5px 11px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.18)}
.h3d .miga.oro{color:var(--gold)}
.h3d .ctas{display:flex;gap:10px;flex-wrap:wrap}
@media (max-width:900px){
  .h3d .heroe{height:78vh;min-height:520px}
  .h3d .vidrio{left:16px;right:16px;top:auto;bottom:86px;transform:none;max-width:none;padding:20px}
}
.h3d .flota{position:absolute;z-index:3;background:var(--card);border:1px solid var(--card-borde);border-radius:14px;padding:9px 13px;
  font-size:12px;font-weight:700;backdrop-filter:blur(10px);box-shadow:0 10px 26px rgba(19,35,63,.2);
  animation:h3dsube 4.5s ease-in-out infinite alternate;transition:opacity .5s;pointer-events:none}
.h3d .flota small{display:block;font-weight:600;color:var(--muted);font-size:10px;letter-spacing:.05em;text-transform:uppercase}
.h3d .f1{top:14%;right:22%}
.h3d .f2{bottom:22%;right:6%;animation-delay:1.4s}
.h3d .heroe.dentro .flota.ext{opacity:0}
.h3d .flota.int{opacity:0;top:14%;right:6%}
.h3d .heroe.dentro .flota.int{opacity:1}
@media (max-width:900px){.h3d .f1,.h3d .f2{display:none}}
@keyframes h3dsube{to{transform:translateY(-9px)}}
.h3d .punto-ok{color:#4a9c8c}.h3d .punto-oro{color:var(--gold)}
.h3d .controles{position:absolute;right:16px;bottom:16px;z-index:4;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
@media (max-width:900px){.h3d .controles{left:16px;right:auto;bottom:16px}}
.h3d .ctl{appearance:none;border:1px solid rgba(255,255,255,.3);background:rgba(13,22,40,.5);color:#fff;backdrop-filter:blur(10px);
  border-radius:12px;cursor:pointer;font:700 15px/1 inherit;width:38px;height:38px;display:grid;place-items:center;transition:transform .15s;font-family:inherit}
.h3d .ctl:hover{transform:translateY(-2px)}
.h3d .ctl-ancho{width:auto;padding:0 16px;font-size:13px}
.h3d .ctl-oro{background:var(--gold);color:#13233f;border-color:transparent}
.h3d .baja{position:absolute;left:50%;bottom:52px;transform:translateX(-50%);z-index:3;color:#fff;font-size:22px;opacity:.85;animation:h3dbaja 1.6s ease-in-out infinite;cursor:pointer;background:none;border:0}
@keyframes h3dbaja{50%{transform:translate(-50%,8px)}}
.h3d .pista{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:3;font-size:11px;color:rgba(255,255,255,.75);
  background:rgba(13,22,40,.45);border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:6px 14px;backdrop-filter:blur(8px)}
@media (max-width:900px){.h3d .pista{display:none}}

/* ── Secciones de negocio: separación clara ── */
.h3d .negocios{padding:56px 0 8px}
.h3d .encabezado{max-width:640px;margin:0 auto 30px;text-align:center}
.h3d .encabezado h2{font-size:clamp(24px,3vw,34px);letter-spacing:-.02em;margin:0 0 8px;text-wrap:balance}
.h3d .encabezado p{color:var(--muted);margin:0}
.h3d .dos{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}
@media (max-width:900px){.h3d .dos{grid-template-columns:1fr}}
.h3d .bloque{border-radius:24px;padding:26px;transition:transform .25s,box-shadow .25s;position:relative;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 18px 50px rgba(19,35,63,.12)}
.h3d .bloque .sello{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;opacity:.75}
.h3d .bloque h3{font-size:clamp(22px,2.4vw,30px);margin:6px 0 8px;letter-spacing:-.02em}
.h3d .bloque .para{font-size:13px;font-weight:700;border-radius:10px;padding:8px 12px;margin:0 0 14px;display:inline-block}
.h3d .bloque ul{margin:0 0 20px;padding:0;list-style:none}
.h3d .bloque li{display:flex;gap:9px;align-items:flex-start;font-size:14px;margin-bottom:9px}
.h3d .bloque li span.ic{flex:none;margin-top:1px}
.h3d .b-paq{background:linear-gradient(145deg,#13233f,#1d3356);color:#fff}
.h3d .b-paq .para{background:rgba(255,255,255,.1);color:#cfe0f5}
.h3d .b-paq li{color:rgba(255,255,255,.88)}
.h3d .b-frg{background:linear-gradient(145deg,#c9a24b,#e0bd6e);color:#1d1b12}
.h3d .b-frg .para{background:rgba(19,35,63,.12);color:#13233f}
.h3d .b-frg li{color:#2a2715}
.h3d .bloque .icono-fondo{position:absolute;right:-22px;bottom:-28px;font-size:150px;opacity:.1;pointer-events:none;line-height:1}
.h3d .bloque:hover{transform:translateY(-5px);box-shadow:0 26px 60px rgba(19,35,63,.2)}
.h3d .bloque .cta-zona{margin-top:auto}
.h3d .b-eco{background:linear-gradient(145deg,#0d5c4a,#149d80);color:#fff}
.h3d .b-wh{background:linear-gradient(145deg,#3b2d6e,#6d5bd0);color:#fff}
.h3d .b-wh .para{background:rgba(255,255,255,.12);color:#e4dcff}
.h3d .b-wh li{color:rgba(255,255,255,.9)}
.h3d .b-eco .para{background:rgba(255,255,255,.12);color:#d8fff4}
.h3d .b-eco li{color:rgba(255,255,255,.9)}
.h3d .pronto{display:inline-block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;background:#ffd666;color:#5c4400;border-radius:999px;padding:4px 11px;margin-left:8px;vertical-align:middle}
.h3d .btn-eco{background:rgba(255,255,255,.16);color:#fff;border:1.5px solid rgba(255,255,255,.45)}
/* Cinta de color entre secciones */
.h3d .cinta{overflow:hidden;padding:14px 0;background:linear-gradient(90deg,#13233f,#3d5a80 40%,#149d80 75%,#c9a24b);position:relative;z-index:1}
.h3d .cinta .riel{display:flex;gap:44px;white-space:nowrap;animation:h3dcinta 26s linear infinite;width:max-content}
.h3d .cinta span{color:#fff;font-weight:800;font-size:13px;letter-spacing:.06em;opacity:.95}
@keyframes h3dcinta{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion: reduce){.h3d .cinta .riel,.h3d .aurora span,.h3d .baja{animation:none}}

/* ── Cómo funciona ── */
.h3d .pasos{padding:52px 0}
.h3d .tres{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media (max-width:900px){.h3d .tres{grid-template-columns:1fr}}
.h3d .paso{background:var(--panel);border:1px solid var(--card-borde);border-radius:20px;padding:22px;box-shadow:0 10px 30px rgba(19,35,63,.07)}
.h3d .paso .num{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:12px;background:var(--gold);color:#13233f;font-weight:900;margin-bottom:10px}
.h3d .paso b{display:block;margin-bottom:4px;font-size:15.5px}
.h3d .paso p{margin:0;color:var(--muted);font-size:13.5px}

/* ── Pie ── */
.h3d footer{border-top:1px solid var(--card-borde);padding:26px 0 34px;margin-top:10px}
.h3d footer .fila{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
.h3d footer a{color:var(--muted);text-decoration:none;font-size:13px;font-weight:600;cursor:pointer}
.h3d footer a:hover{color:var(--fg)}
.h3d footer .cr{margin-left:auto;color:var(--muted);font-size:12px}
@media (prefers-reduced-motion: reduce){.h3d .flota{animation:none}}
`

export default function Home3D() {
  const navigate = useNavigate()
  const escenaRef = useRef(null)
  const apiRef = useRef(null)
  const [dentro, setDentro] = useState(false)
  const [transicion, setTransicion] = useState(false)

  useEffect(() => {
    const tituloPrev = document.title
    document.title = 'MilePay — Freight y última milla, bajo control'
    let oscuro = false
    try {
      oscuro = window.matchMedia('(prefers-color-scheme: dark)').matches
      if (document.documentElement.getAttribute('data-theme') === 'dark' || document.documentElement.classList.contains('dark')) oscuro = true
      if (document.documentElement.getAttribute('data-theme') === 'light') oscuro = false
    } catch { /* sin matchMedia */ }
    let reduce = false
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* noop */ }
    let api = null
    try {
      api = montarEscenaMilePay(escenaRef.current, {
        oscuro,
        reduce,
        alCambiarModo: (m) => {
          setDentro(m === 'dentro' || m === 'entrando')
          setTransicion(m === 'entrando' || m === 'saliendo')
        },
      })
    } catch { /* sin WebGL: la portada sigue sirviendo con el texto */ }
    apiRef.current = api
    return () => {
      document.title = tituloPrev
      if (api) api.destruir()
    }
  }, [])

  const entrar = () => navigate('/elegir')

  return (
    <div className="h3d">
      <style>{CSS}</style>
      <div className="aurora" aria-hidden="true"><span className="au1" /><span className="au2" /><span className="au3" /></div>

      {/* ═══ HERO INMERSIVO: la escena 3D llena la pantalla ═══ */}
      <div ref={escenaRef} className={`heroe${dentro ? ' dentro' : ''}`}>
        <div className="velo" aria-hidden="true" />
        <div className="velo-abajo" aria-hidden="true" />

        <div className="nav">
          <span className="logo" onClick={() => navigate('/')}>Mile<b>Pay</b>.</span>
          <a onClick={() => document.getElementById('negocios')?.scrollIntoView({ behavior: 'smooth' })}>Módulos</a>
          <a onClick={() => navigate('/freight')}>Freight</a>
          <span className="sep"><button className="btn btn-oro" onClick={entrar}>Entrar</button></span>
        </div>

        <div className="vidrio">
          <h1>Freight y última milla, <em>bajo control</em>.</h1>
          <div className="migas">
            <span className="miga">📦 Última milla</span>
            <span className="miga oro">🚛 Freight</span>
            <span className="miga" style={{ color: '#7dffd9' }}>🛒 Ecommerce · muy pronto</span>
            <span className="miga" style={{ color: '#cfc3ff' }}>🏭 Warehouse · muy pronto</span>
          </div>
          <p>Una plataforma, cuatro negocios: última milla de paquetes, materiales a granel, compras internacionales y servicios de almacén. Cada uno con su propio módulo, sin mezclarse.</p>
          <div className="ctas">
            <button className="btn btn-oro" onClick={entrar}>Entrar a MilePay</button>
            <button className="btn btn-blanco" onClick={() => document.getElementById('negocios')?.scrollIntoView({ behavior: 'smooth' })}>Conocer los 4 módulos ↓</button>
          </div>
        </div>

        <div className="flota ext f1"><small>Paquetería</small><span className="punto-ok">✓</span> Facturas que cuadran al centavo</div>
        <div className="flota ext f2"><small>Freight</small><span className="punto-oro">▸</span> Volteos despachados en vivo</div>
        <div className="flota int"><small>Dentro del almacén</small><span className="punto-ok">✓</span> Escaneo y cuadre en vivo</div>

        <div className="controles">
          <button className="ctl" aria-label="Acercar" onClick={() => apiRef.current && apiRef.current.zoomMas()}>+</button>
          <button className="ctl" aria-label="Alejar" onClick={() => apiRef.current && apiRef.current.zoomMenos()}>−</button>
          <button className="ctl" aria-label="Centrar" title="Centrar" onClick={() => apiRef.current && apiRef.current.centrar()}>⌂</button>
          <button className="ctl ctl-ancho ctl-oro" disabled={transicion} onClick={() => apiRef.current && apiRef.current.alternarAlmacen()}>
            {dentro ? '← Salir del almacén' : '🏭 Entrar al almacén'}
          </button>
        </div>
        <div className="pista">arrastra para girar · rueda para acercar · entra al almacén</div>
        <button className="baja" aria-label="Bajar" onClick={() => document.getElementById('negocios')?.scrollIntoView({ behavior: 'smooth' })}>⌄</button>
      </div>

      {/* Cinta de color con lo que hace la plataforma */}
      <div className="cinta" aria-hidden="true">
        <div className="riel">
          {[0, 1].map((k) => (
            <span key={k}>
              <span>📦 FACTURAS AL CENTAVO</span>&nbsp;&nbsp;&nbsp;&nbsp;<span>🚛 DESPACHO DE VOLTEOS EN VIVO</span>&nbsp;&nbsp;&nbsp;&nbsp;<span>🛒 COMPRAS INTERNACIONALES</span>&nbsp;&nbsp;&nbsp;&nbsp;<span>🗺️ GPS Y GEOCERCAS</span>&nbsp;&nbsp;&nbsp;&nbsp;<span>💵 PAGOS A CHOFERES</span>&nbsp;&nbsp;&nbsp;&nbsp;<span>🏦 CADA DEPÓSITO EXPLICADO</span>&nbsp;&nbsp;&nbsp;&nbsp;<span>🏭 WAREHOUSE: INBOUND · OUTBOUND · STAFF</span>&nbsp;&nbsp;&nbsp;&nbsp;
            </span>
          ))}
        </div>
      </div>

      {/* ═══ DOS NEGOCIOS, CLARAMENTE SEPARADOS ═══ */}
      <section id="negocios" className="negocios">
        <div className="marco">
          <div className="encabezado">
            <h2>Cuatro negocios. Cuatro módulos. Cero confusión.</h2>
            <p>Cada operación tiene su propio módulo, sus pantallas y sus números — elige la tuya.</p>
          </div>
          <div className="dos">
            {/* 📦 PAQUETERÍA */}
            <div className="bloque b-paq">
              <span className="icono-fondo" aria-hidden="true">📦</span>
              <span className="sello">Módulo 1 · Paquetería</span>
              <h3>Última milla de paquetes</h3>
              <span className="para">¿Repartes paquetes puerta a puerta? Esto es lo tuyo.</span>
              <ul>
                <li><span className="ic">✅</span> Facturas semanales que cuadran al centavo, con verificación automática</li>
                <li><span className="ic">💵</span> Pagos a choferes con tarifas por paquete, claims y bonos</li>
                <li><span className="ic">🏦</span> Cobros y fondo: cada depósito explicado</li>
                <li><span className="ic">📊</span> Dashboard, performance por chofer y reportes</li>
              </ul>
              <div className="cta-zona"><button className="btn btn-oro" onClick={entrar}>Entrar a Paquetería</button></div>
            </div>
            {/* 🚛 FREIGHT */}
            <div className="bloque b-frg">
              <span className="icono-fondo" aria-hidden="true">🚛</span>
              <span className="sello">Módulo 2 · MilePay Freight</span>
              <h3>Materiales a granel</h3>
              <span className="para">¿Mueves arena, grava o agregados en volteos? Esto es Freight.</span>
              <ul>
                <li><span className="ic">🛻</span> Órdenes y despacho de volteos en vivo, viaje por viaje</li>
                <li><span className="ic">🗺️</span> GPS, geocercas y prueba de entrega en obra</li>
                <li><span className="ic">👷</span> Portales para cliente, chofer, transportista y despachador</li>
                <li><span className="ic">🧾</span> Facturación por viaje y conciliación de toneladas</li>
              </ul>
              <div className="cta-zona"><button className="btn btn-navy" onClick={() => navigate('/freight')}>Conocer Freight</button></div>
            </div>
            {/* 🛒 ECOMMERCE (en construcción) */}
            <div className="bloque b-eco">
              <span className="icono-fondo" aria-hidden="true">🛒</span>
              <span className="sello">Módulo 3 · Ecommerce<span className="pronto">Muy pronto</span></span>
              <h3>Compras internacionales</h3>
              <span className="para">¿Quieres productos de afuera sin dolores de cabeza? Nosotros lo traemos.</span>
              <ul>
                <li><span className="ic">🛍️</span> Catálogo con precio final: producto, importación y entrega incluidos</li>
                <li><span className="ic">🌎</span> Compramos al proveedor internacional por ti</li>
                <li><span className="ic">🛃</span> Aduana e importación gestionadas por nuestra empresa</li>
                <li><span className="ic">🚪</span> Entrega en tu puerta con seguimiento completo</li>
              </ul>
              <div className="cta-zona"><button className="btn btn-eco" disabled style={{ cursor: 'default', opacity: .85 }}>🔒 En construcción</button></div>
            </div>
            {/* 🏭 WAREHOUSE (en construcción) */}
            <div className="bloque b-wh">
              <span className="icono-fondo" aria-hidden="true">🏭</span>
              <span className="sello">Módulo 4 · Warehouse<span className="pronto">Muy pronto</span></span>
              <h3>Servicios de almacén</h3>
              <span className="para">¿Necesitas manos y espacio para tu operación? Nuestro almacén trabaja por ti.</span>
              <ul>
                <li><span className="ic">🔀</span> Clasificación y sorteo de paquetes por ruta, zona o cliente</li>
                <li><span className="ic">👷</span> Staffing: clasificadores, empacadores, montacarguistas y supervisores</li>
                <li><span className="ic">📥</span> Inbound y outbound gestionados: recepción, verificación y despacho</li>
                <li><span className="ic">🏗️</span> Almacenaje y cross-dock con control de entradas y salidas</li>
              </ul>
              <div className="cta-zona"><button className="btn btn-eco" disabled style={{ cursor: 'default', opacity: .85 }}>🔒 En construcción</button></div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ CÓMO FUNCIONA ═══ */}
      <section className="pasos">
        <div className="marco">
          <div className="encabezado">
            <h2>Así de simple</h2>
            <p>La misma filosofía en los cuatro módulos: datos reales, cuadre exacto y cero sorpresas.</p>
          </div>
          <div className="tres">
            <div className="paso"><span className="num">1</span><b>Carga tu operación</b><p>Sube la factura semanal de paquetería o registra las órdenes de material de tus clientes.</p></div>
            <div className="paso"><span className="num">2</span><b>MilePay cuadra y controla</b><p>Verificación al centavo, pagos de choferes, claims, GPS y prueba de entrega — todo automático.</p></div>
            <div className="paso"><span className="num">3</span><b>Cobra con claridad</b><p>Cada depósito explicado, cada viaje facturado y la utilidad de tu semana a la vista.</p></div>
          </div>
        </div>
      </section>

      {/* ═══ PIE ═══ */}
      <footer>
        <div className="marco">
          <div className="fila">
            <span className="logo" style={{ color: 'var(--fg)', textShadow: 'none' }} onClick={() => navigate('/')}>Mile<b>Pay</b>.</span>
            <a onClick={() => document.getElementById('negocios')?.scrollIntoView({ behavior: 'smooth' })}>Módulos</a>
            <a onClick={() => navigate('/freight')}>Sitio de Freight</a>
            <a onClick={() => navigate('/por-que-milepay')}>Por qué MilePay (Freight)</a>
            <a onClick={entrar}>Iniciar sesión</a>
            <span className="cr">© {new Date().getFullYear()} MilePay</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
