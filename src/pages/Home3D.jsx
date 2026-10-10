// ============================================================================
// HOME PÚBLICO de MilePay (portada del sitio en www.milepay.io).
//
// Hero con escena 3D real (three.js, ver home3d/escenaMilePay.js): el patio de
// la operación al atardecer — almacén MilePay, volteos de Freight, camionetas
// de última milla — con cámara libre (girar/zoom) y visita al interior del
// almacén por el portón. En modo oscuro la escena es nocturna.
//
// Sin marcas de carriers: las compañías se eligen al iniciar sesión (/elegir).
// La landing de Freight sigue viva en /freight. Estilos propios (no Tailwind)
// igual que LandingFreight, para que la portada no dependa del CSS de la app.
// ============================================================================
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { montarEscenaMilePay } from './home3d/escenaMilePay'

const CSS = `
.h3d{--bg:#eef1f6;--fg:#13233f;--muted:#5b6a84;--gold:#c9a24b;--card:rgba(255,255,255,.72);--card-borde:rgba(255,255,255,.9);
  background:var(--bg);color:var(--fg);min-height:100vh;font:15px/1.5 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]) .h3d{--bg:#0b1322;--fg:#e8edf6;--muted:#9aa8c0;--card:rgba(21,34,58,.6);--card-borde:rgba(255,255,255,.08)}
}
:root[data-theme="dark"] .h3d{--bg:#0b1322;--fg:#e8edf6;--muted:#9aa8c0;--card:rgba(21,34,58,.6);--card-borde:rgba(255,255,255,.08)}
.h3d *{box-sizing:border-box}
.h3d .marco{max-width:1220px;margin:0 auto;padding-inline:16px;padding-block:0 40px}
.h3d .nav{display:flex;align-items:center;gap:18px;padding:18px 0;flex-wrap:wrap}
.h3d .logo{font-size:20px;font-weight:800;letter-spacing:-.02em;cursor:pointer}
.h3d .logo b{color:var(--gold)}
.h3d .nav a{color:var(--muted);text-decoration:none;font-weight:600;font-size:13.5px;cursor:pointer}
.h3d .nav a:hover{color:var(--fg)}
.h3d .sep{margin-left:auto;display:flex;gap:10px;align-items:center}
.h3d .btn{display:inline-block;border-radius:12px;padding:11px 18px;font-weight:700;font-size:14px;text-decoration:none;transition:transform .2s;border:0;cursor:pointer;font-family:inherit}
.h3d .btn:hover{transform:translateY(-2px)}
.h3d .btn-oro{background:var(--gold);color:#13233f;box-shadow:0 8px 20px rgba(201,162,75,.35)}
.h3d .btn-linea{border:1.5px solid var(--muted);color:var(--fg);background:transparent}
.h3d .hero{display:grid;grid-template-columns:5fr 7fr;gap:22px;align-items:center}
@media (max-width:900px){.h3d .hero{grid-template-columns:1fr}}
.h3d h1{font-size:clamp(30px,4.6vw,50px);line-height:1.06;letter-spacing:-.03em;margin:0 0 16px;text-wrap:balance}
.h3d h1 em{font-style:normal;color:var(--gold)}
.h3d .hero p{color:var(--muted);max-width:46ch;margin:0 0 22px}
.h3d .marcas{display:flex;gap:10px;margin:0 0 24px;flex-wrap:wrap}
.h3d .marca{font-size:12px;font-weight:800;padding:6px 12px;border-radius:999px;background:var(--card);border:1px solid var(--card-borde);backdrop-filter:blur(8px)}
.h3d .ctas{display:flex;gap:12px;flex-wrap:wrap}
.h3d .escena{position:relative;min-width:0;aspect-ratio:980/660;border-radius:22px;overflow:hidden;box-shadow:0 24px 70px rgba(19,35,63,.18)}
.h3d .escena canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block;cursor:grab;touch-action:none}
.h3d .escena.arrastrando canvas{cursor:grabbing}
.h3d .flota{position:absolute;background:var(--card);border:1px solid var(--card-borde);border-radius:14px;padding:10px 14px;
  font-size:12.5px;font-weight:700;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);
  box-shadow:0 10px 26px rgba(19,35,63,.14);animation:h3dsube 4.5s ease-in-out infinite alternate;transition:opacity .5s;pointer-events:none}
.h3d .flota small{display:block;font-weight:600;color:var(--muted);font-size:10.5px;letter-spacing:.05em;text-transform:uppercase}
.h3d .f1{top:4%;left:4%}
.h3d .f2{bottom:17%;right:3%;animation-delay:1.4s}
.h3d .f3{top:30%;right:4%;animation-delay:.7s}
.h3d .escena.dentro .flota.ext{opacity:0}
.h3d .flota.int{opacity:0;top:6%;right:4%}
.h3d .escena.dentro .flota.int{opacity:1}
@keyframes h3dsube{to{transform:translateY(-9px)}}
.h3d .punto-ok{color:#4a9c8c}.h3d .punto-oro{color:var(--gold)}
.h3d .controles{position:absolute;left:12px;bottom:12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;z-index:2}
.h3d .ctl{appearance:none;border:1px solid var(--card-borde);background:var(--card);color:var(--fg);backdrop-filter:blur(10px);
  border-radius:12px;cursor:pointer;font:700 15px/1 inherit;width:38px;height:38px;display:grid;place-items:center;
  box-shadow:0 8px 20px rgba(19,35,63,.12);transition:transform .15s;font-family:inherit}
.h3d .ctl:hover{transform:translateY(-2px)}
.h3d .ctl-ancho{width:auto;padding:0 16px;font-size:13px}
.h3d .ctl-oro{background:var(--gold);color:#13233f;border-color:transparent}
.h3d .pista{position:absolute;right:12px;bottom:12px;font-size:11px;color:var(--muted);background:var(--card);
  border:1px solid var(--card-borde);border-radius:999px;padding:6px 12px;backdrop-filter:blur(8px);z-index:2}
@media (max-width:900px){.h3d .pista{display:none}}
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
      <div className="marco">
        <div className="nav">
          <span className="logo" onClick={() => navigate('/')}>Mile<b>Pay</b>.</span>
          <a onClick={() => navigate('/freight')}>Freight</a>
          <span className="sep">
            <button className="btn btn-oro" onClick={entrar}>Entrar</button>
          </span>
        </div>

        <div className="hero">
          <div>
            <h1>Freight y última milla, <em>bajo control</em>.</h1>
            <p>Toda tu operación en un solo lugar.</p>
            <div className="ctas">
              <button className="btn btn-oro" onClick={entrar}>Entrar a MilePay</button>
            </div>
          </div>

          <div ref={escenaRef} className={`escena${dentro ? ' dentro' : ''}`}>
            <div className="flota ext f2"><small>Cuadre con la factura</small><span className="punto-ok">✓</span> Al centavo, siempre</div>
            <div className="flota int"><small>Dentro del almacén</small><span className="punto-ok">✓</span> Escaneo y cuadre en vivo</div>
            <div className="controles">
              <button className="ctl" aria-label="Acercar" onClick={() => apiRef.current && apiRef.current.zoomMas()}>+</button>
              <button className="ctl" aria-label="Alejar" onClick={() => apiRef.current && apiRef.current.zoomMenos()}>−</button>
              <button className="ctl" aria-label="Centrar" title="Centrar" onClick={() => apiRef.current && apiRef.current.centrar()}>⌂</button>
              <button className="ctl ctl-ancho ctl-oro" disabled={transicion} onClick={() => apiRef.current && apiRef.current.alternarAlmacen()}>
                {dentro ? '← Salir del almacén' : '🏭 Entrar al almacén'}
              </button>
            </div>
            <div className="pista">arrastra para girar · rueda para acercar</div>
          </div>
        </div>
      </div>
    </div>
  )
}
