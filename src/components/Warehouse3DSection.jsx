// Sección opcional: almacén en 3D (reutiliza la escena montarEscenaMilePay)
// dentro del diseño nuevo. Si no hay WebGL, la sección simplemente queda vacía.
import { useEffect, useRef } from 'react'
import { montarEscenaMilePay } from '../pages/home3d/escenaMilePay'
import { useLang } from '../i18n'

export default function Warehouse3DSection() {
  const ref = useRef(null)
  const { lang } = useLang()
  useEffect(() => {
    let reduce = false
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* noop */ }
    let api = null
    try { api = montarEscenaMilePay(ref.current, { oscuro: true, reduce }) } catch { /* sin WebGL */ }
    return () => { if (api) api.destruir() }
  }, [])
  return (
    <section className="bg-rd-navy">
      <style>{`.rd3d canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block}`}</style>
      <div className="mx-auto max-w-6xl px-5 py-16">
        <div className="mx-auto max-w-2xl text-center">
          <span className="font-mono text-[11px] uppercase tracking-wide text-rd-parcel">{lang === 'en' ? 'Live operation' : 'Operación en vivo'}</span>
          <h2 className="mt-2 font-display text-2xl font-extrabold tracking-tight text-white sm:text-3xl">{lang === 'en' ? 'See your whole operation in 3D' : 'Mira toda tu operación en 3D'}</h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-rd-navy-sub">{lang === 'en' ? 'From the vans on the street to the packages inside the warehouse — one live view of everything that moves.' : 'Desde las vans en la calle hasta los paquetes dentro del almacén — una vista en vivo de todo lo que se mueve.'}</p>
        </div>
        <div className="relative mt-8 overflow-hidden rounded-card border border-rd-navy-line bg-rd-navy-card" style={{ aspectRatio: '16 / 9' }}>
          <div ref={ref} className="rd3d absolute inset-0" />
          <span className="absolute left-3 top-3 z-10 rounded-full bg-black/40 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-white/80">{lang === 'en' ? 'Sample 3D view' : 'Vista 3D de ejemplo'}</span>
        </div>
      </div>
    </section>
  )
}
