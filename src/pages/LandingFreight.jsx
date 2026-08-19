// Landing PÚBLICA de MilePay Freight (marketing). Reproduce 1:1 la maqueta
// docs/milepay-freight-landing.html: el CSS y el HTML del cuerpo se importan como
// texto crudo (?raw) y el script (i18n ES/EN, tablero de despacho vivo, scroll reveal,
// menú móvil) se porta a un efecto de React. Los botones [data-login] se conectan a la
// ruta REAL de login/selección de módulo (/elegir). No requiere autenticación.
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import landingCss from './landing/landing.css?raw'
import landingHtml from './landing/landing-body.html?raw'

export default function LandingFreight() {
  const navigate = useNavigate()
  const rootRef = useRef(null)

  // SEO básico (título + descripción); se restaura al desmontar.
  useEffect(() => {
    const tituloPrev = document.title
    document.title = 'MilePay Freight — Despacho para transporte de materiales a granel'
    let meta = document.querySelector('meta[name="description"]')
    const creada = !meta
    if (!meta) { meta = document.createElement('meta'); meta.setAttribute('name', 'description'); document.head.appendChild(meta) }
    const descPrev = meta.getAttribute('content')
    meta.setAttribute('content', 'MilePay Freight recibe cada orden y la empareja con el chofer correcto por tipo de camión, disponibilidad y trabajo. Despacho, mapa en vivo, app del chofer y facturación en un solo sistema.')
    return () => {
      document.title = tituloPrev
      if (creada && meta.parentNode) meta.parentNode.removeChild(meta)
      else if (meta && descPrev != null) meta.setAttribute('content', descPrev)
    }
  }, [])

  // Porta el script de la maqueta, acotado al contenedor de la landing.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const timers = []
    const setT = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id }
    let running = true

    // ── i18n (ES por defecto; EN vía data-en) ──────────────────────────────
    const nodes = [...root.querySelectorAll('[data-en]')]
    nodes.forEach((n) => { n._es = n.innerHTML })
    const board = {
      matchBy: { es: 'Emparejando por tipo de camión…', en: 'Matching by truck type…' },
      matching: { es: 'Emparejando ', en: 'Matching ' },
      ellipsis: '…',
      accepted: { es: (id) => 'Orden ' + id + ' aceptada', en: (id) => 'Order ' + id + ' accepted' },
      trucks: { dump: { es: 'Dump Truck', en: 'Dump Truck' }, mixer: { es: 'Concrete Mixer', en: 'Concrete Mixer' }, enddump: { es: 'End Dump', en: 'End Dump' } },
    }
    let lang = 'es'
    const L = () => lang
    const setLang = (lg) => {
      lang = lg
      document.documentElement.lang = lg
      nodes.forEach((n) => { n.innerHTML = lg === 'en' ? n.getAttribute('data-en') : n._es })
      root.querySelectorAll('#langToggle button').forEach((b) => b.classList.toggle('active', b.dataset.lang === lg))
      const mt = root.querySelector('#matchText')
      if (mt && !mt.dataset.dyn) mt.textContent = board.matchBy[lg]
    }
    const langHandlers = [...root.querySelectorAll('#langToggle button')].map((b) => {
      const h = () => setLang(b.dataset.lang); b.addEventListener('click', h); return [b, h]
    })

    // ── Scroll reveal ──────────────────────────────────────────────────────
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } }), { threshold: 0.14 })
    root.querySelectorAll('.reveal').forEach((el) => io.observe(el))

    // ── Menú móvil ─────────────────────────────────────────────────────────
    const navToggle = root.querySelector('#navToggle')
    const navLinks = root.querySelector('#navLinks')
    const navToggleH = () => navLinks && navLinks.classList.toggle('open')
    if (navToggle) navToggle.addEventListener('click', navToggleH)
    const navLinkHandlers = []
    if (navLinks) navLinks.querySelectorAll('a').forEach((a) => { const h = () => navLinks.classList.remove('open'); a.addEventListener('click', h); navLinkHandlers.push([a, h]) })

    // ── Login: [data-login] → ruta real (/elegir) ──────────────────────────
    const loginHandlers = []
    root.querySelectorAll('[data-login]').forEach((a) => {
      a.setAttribute('href', '/elegir')
      const h = (e) => { e.preventDefault(); navigate('/elegir') }
      a.addEventListener('click', h); loginHandlers.push([a, h])
    })

    // ── Tablero de despacho vivo (respeta prefers-reduced-motion) ──────────
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce) {
      const orders = root.querySelector('#ordersStack')
      const drivers = root.querySelector('#driversStack')
      const matchText = root.querySelector('#matchText')
      const qCount = root.querySelector('#qCount')
      const dCount = root.querySelector('#dCount')
      if (orders && drivers && matchText && qCount && dCount) {
        const cycle = () => {
          if (!running) return
          const oCards = [...orders.querySelectorAll('.card:not(.done)')]
          const dCards = [...drivers.querySelectorAll('.card:not(.done)')]
          if (!oCards.length || !dCards.length) { setT(reset, 1400); return }
          const o = oCards[0]; const type = o.dataset.truck
          const d = dCards.find((c) => c.dataset.truck === type) || dCards[0]
          matchText.dataset.dyn = '1'
          matchText.textContent = board.matching[L()] + (board.trucks[type] ? board.trucks[type][L()] : '') + board.ellipsis
          o.classList.add('matching'); d.classList.add('matching')
          setT(() => {
            o.classList.remove('matching'); d.classList.remove('matching')
            matchText.textContent = board.accepted[L()](o.querySelector('.card-id').textContent)
            o.classList.add('done'); d.classList.add('done')
            setT(() => {
              qCount.textContent = orders.querySelectorAll('.card:not(.done)').length
              dCount.textContent = drivers.querySelectorAll('.card:not(.done)').length
              if (running) cycle()
            }, 700)
          }, 1900)
        }
        const reset = () => {
          orders.querySelectorAll('.card').forEach((c) => c.classList.remove('done', 'matching'))
          drivers.querySelectorAll('.card').forEach((c) => c.classList.remove('done', 'matching'))
          qCount.textContent = orders.querySelectorAll('.card').length
          dCount.textContent = drivers.querySelectorAll('.card').length
          matchText.dataset.dyn = ''
          matchText.textContent = board.matchBy[L()]
          setT(cycle, 1200)
        }
        setT(cycle, 1400)
      }
    }

    setLang('es') // idioma por defecto

    return () => {
      running = false
      timers.forEach(clearTimeout)
      io.disconnect()
      langHandlers.forEach(([b, h]) => b.removeEventListener('click', h))
      if (navToggle) navToggle.removeEventListener('click', navToggleH)
      navLinkHandlers.forEach(([a, h]) => a.removeEventListener('click', h))
      loginHandlers.forEach(([a, h]) => a.removeEventListener('click', h))
    }
  }, [navigate])

  return (
    <>
      {/* CSS de la maqueta, montado solo mientras se ve la landing (se retira al salir). */}
      <style dangerouslySetInnerHTML={{ __html: landingCss }} />
      <div ref={rootRef} dangerouslySetInnerHTML={{ __html: landingHtml }} />
    </>
  )
}
