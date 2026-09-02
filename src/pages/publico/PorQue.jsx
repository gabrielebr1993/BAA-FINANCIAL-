// SITIO PÚBLICO · /por-que-milepay — Por qué elegirnos. Ventajas reales + tabla
// comparativa interactiva (cada fila se expande con la explicación honesta):
// comparamos contra "soluciones genéricas / juntar varias herramientas", no
// contra marcas específicas.
import { useState } from 'react'
import { Award, Wrench, Boxes, Mountain, BadgeDollarSign, Headset, PiggyBank, Check, X, Minus, ChevronDown, ArrowRight } from 'lucide-react'
import { useLangPub, NavPub, FooterPub, BandaCTA, CSS_PUB, NAVY, NAVY_DEEP, GOLD, CREAM, CREAM_LINE, OK, STEEL } from './comun'

function Ventajas({ tx }) {
  const V = [
    { i: Wrench, t: tx('Somos dueños del sistema', 'We own the system'), d: tx('No revendemos software de terceros: lo desarrollamos y lo mejoramos nosotros mismos, a la medida de tu operación. Si necesitas algo, se construye — no se "levanta un ticket" a otra compañía.', 'We do not resell third-party software: we build and improve it ourselves, tailored to your operation. If you need something, it gets built — not "escalated" to another company.') },
    { i: Boxes, t: tx('Todo en uno', 'All in one'), d: tx('Despacho, GPS, app del chofer, tickets y facturación en UNA plataforma conectada — no cinco herramientas sueltas que hay que integrar, mantener y pagar por separado.', 'Dispatch, GPS, driver app, tickets and billing in ONE connected platform — not five loose tools you must integrate, maintain and pay for separately.') },
    { i: Mountain, t: tx('Hecho para materiales a granel', 'Built for bulk materials'), d: tx('No es logística genérica: está pensado para asfalto, grava, concreto, arena y piedra — con pesos de báscula, tickets BOL y control del pedido REALES, como opera tu industria.', 'Not generic logistics: designed for asphalt, gravel, concrete, sand and stone — with REAL scale weights, BOL tickets and order progress, the way your industry runs.') },
    { i: BadgeDollarSign, t: tx('Precio justo, sin costos ocultos', 'Fair price, no hidden fees'), d: tx('Sin sorpresas ni cargos por cada módulo adicional, ni por cada transportista o cliente que conectes.', 'No surprises and no charges for each extra module, nor for every carrier or customer you connect.') },
    { i: Headset, t: tx('Soporte directo y bilingüe', 'Direct, bilingual support'), d: tx('Hablas con quien conoce el sistema, en español o inglés — no con el call center impersonal de una plataforma gigante.', 'You talk to people who know the system, in Spanish or English — not the impersonal call center of a giant platform.') },
    { i: PiggyBank, t: tx('Más simple y más barato', 'Simpler and cheaper'), d: tx('Todo lo anterior junto significa una sola mensualidad, una sola curva de aprendizaje y un solo responsable — en vez de armar el mismo resultado con varias compañías.', 'All of the above together means one bill, one learning curve and one accountable partner — instead of assembling the same result from several companies.') },
  ]
  return (
    <section className="wrap-pub py-20">
      <div className="f-mono mb-3 text-[12.5px] font-medium uppercase tracking-[.14em]" style={{ color: GOLD }}>{tx('Las razones', 'The reasons')}</div>
      <h2 className="mb-12 max-w-[680px] text-[clamp(26px,3.2vw,38px)]" style={{ color: NAVY }}>{tx('Seis razones para elegirnos', 'Six reasons to choose us')}</h2>
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {V.map((v, i) => (
          <div key={i} className="rounded-2xl border bg-white p-7 transition-transform hover:-translate-y-1" style={{ borderColor: CREAM_LINE }}>
            <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl" style={{ background: `linear-gradient(135deg,${GOLD},#a9863a)` }}><v.i size={22} style={{ color: NAVY_DEEP }} /></span>
            <h3 className="mb-2 text-[18px]" style={{ color: NAVY }}>{v.t}</h3>
            <p className="text-[14.5px] leading-relaxed" style={{ color: STEEL }}>{v.d}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Comparativa({ tx }) {
  const FILAS = [
    { t: tx('Todo en un sistema', 'Everything in one system'), mp: 'si', otros: 'no', d: tx('Con MilePay, despacho, GPS, app, tickets y facturas viven conectados. Juntando herramientas sueltas, cada dato se recaptura y los sistemas no se hablan.', 'With MilePay, dispatch, GPS, app, tickets and invoices live connected. Gluing loose tools together means re-entering data between systems that do not talk.') },
    { t: tx('Hecho para granel', 'Built for bulk'), mp: 'si', otros: 'parcial', d: tx('El software genérico de logística no entiende toneladas de báscula, plantas ni control de pedido; hay que forzarlo. MilePay nació para asfalto, grava y concreto.', 'Generic logistics software does not understand scale tons, plants or order progress; you must force it. MilePay was born for asphalt, gravel and concrete.') },
    { t: tx('Pesos y tickets reales', 'Real weights & tickets'), mp: 'si', otros: 'no', d: tx('OCR del ticket de báscula, BOL con Gross/Tare/Net y cobro por peso real. En la mayoría de las alternativas, eso es teclear a mano o pagar otro módulo.', 'Scale-ticket OCR, BOL with Gross/Tare/Net and billing by real weight. In most alternatives that means manual typing or paying for yet another module.') },
    { t: tx('Soporte bilingüe (ES/EN)', 'Bilingual support (ES/EN)'), mp: 'si', otros: 'parcial', d: tx('Nuestro equipo te atiende en tu idioma y conoce tu operación. Las plataformas grandes atienden por ticket, en inglés y en fila.', 'Our team supports you in your language and knows your operation. Big platforms answer by ticket, in English, in a queue.') },
    { t: tx('Sin costos ocultos', 'No hidden fees'), mp: 'si', otros: 'no', d: tx('Una mensualidad clara. Sumando varias herramientas pagas cada licencia, cada integración y cada asiento — y el total siempre crece.', 'One clear bill. Stacking tools means paying every license, every integration and every seat — and the total always grows.') },
    { t: tx('Un solo proveedor responsable', 'One accountable vendor'), mp: 'si', otros: 'no', d: tx('Si algo falla, respondemos nosotros. Con cinco proveedores, cada uno culpa al otro.', 'If something breaks, we answer. With five vendors, each one blames the next.') },
  ]
  const [abierta, setAbierta] = useState(0)
  const Celda = ({ v }) => v === 'si'
    ? <span className="inline-grid h-7 w-7 place-items-center rounded-full" style={{ background: 'rgba(201,162,75,.15)' }}><Check size={16} style={{ color: GOLD }} strokeWidth={3} /></span>
    : v === 'parcial'
      ? <span className="inline-grid h-7 w-7 place-items-center rounded-full" style={{ background: 'rgba(138,133,120,.15)' }}><Minus size={16} style={{ color: '#8a8578' }} strokeWidth={3} /></span>
      : <span className="inline-grid h-7 w-7 place-items-center rounded-full" style={{ background: 'rgba(224,93,93,.1)' }}><X size={16} style={{ color: '#e05d5d' }} strokeWidth={3} /></span>
  return (
    <section className="border-y py-20" style={{ background: NAVY_DEEP, borderColor: 'rgba(201,162,75,.14)' }}>
      <div className="wrap-pub">
        <div className="f-mono mb-3 text-[12.5px] font-medium uppercase tracking-[.14em]" style={{ color: GOLD }}>{tx('Comparación honesta', 'Honest comparison')}</div>
        <h2 className="mb-3 max-w-[680px] text-[clamp(26px,3.2vw,38px)]" style={{ color: CREAM }}>{tx('MilePay vs. juntar soluciones sueltas', 'MilePay vs. stitching loose tools')}</h2>
        <p className="mb-10 max-w-[680px] text-[15px]" style={{ color: 'rgba(248,243,235,.65)' }}>{tx('Comparamos contra software genérico y contra armar el resultado con varias herramientas — no contra ninguna marca en particular. Toca cada fila para ver el detalle.', 'We compare against generic software and against assembling the result from several tools — not against any specific brand. Tap each row for the detail.') }</p>
        <div className="overflow-hidden rounded-2xl border" style={{ borderColor: 'rgba(255,255,255,.12)' }}>
          <div className="grid grid-cols-[1fr_84px_84px] items-center gap-2 px-4 py-3 sm:grid-cols-[1fr_130px_150px] sm:px-6" style={{ background: 'rgba(255,255,255,.05)' }}>
            <span className="f-mono text-[10.5px] uppercase tracking-widest" style={{ color: 'rgba(248,243,235,.5)' }}>{tx('Criterio', 'Criteria')}</span>
            <span className="f-display text-center text-[13px] font-bold" style={{ color: GOLD }}>MilePay</span>
            <span className="f-mono text-center text-[10.5px] uppercase tracking-wider" style={{ color: 'rgba(248,243,235,.5)' }}>{tx('Otras / sueltas', 'Others / loose')}</span>
          </div>
          {FILAS.map((f, i) => (
            <div key={i} className="border-t" style={{ borderColor: 'rgba(255,255,255,.08)' }}>
              <button onClick={() => setAbierta(abierta === i ? -1 : i)} className="grid w-full grid-cols-[1fr_84px_84px] items-center gap-2 px-4 py-3.5 text-left transition sm:grid-cols-[1fr_130px_150px] sm:px-6" style={{ background: abierta === i ? 'rgba(201,162,75,.06)' : 'transparent' }}>
                <span className="flex items-center gap-2 text-[14.5px] font-semibold" style={{ color: CREAM }}>
                  <ChevronDown size={15} className="flex-shrink-0 transition-transform" style={{ color: GOLD, transform: abierta === i ? 'rotate(180deg)' : 'none' }} /> {f.t}
                </span>
                <span className="text-center"><Celda v={f.mp} /></span>
                <span className="text-center"><Celda v={f.otros} /></span>
              </button>
              {abierta === i && (
                <p className="px-4 pb-4 pl-11 text-[13.5px] leading-relaxed sm:px-6 sm:pl-[52px]" style={{ color: 'rgba(248,243,235,.7)' }}>{f.d}</p>
              )}
            </div>
          ))}
        </div>
        <div className="f-mono mt-4 flex flex-wrap gap-5 text-[11px] uppercase tracking-wider" style={{ color: 'rgba(248,243,235,.45)' }}>
          <span className="flex items-center gap-1.5"><Check size={13} style={{ color: GOLD }} /> {tx('incluido', 'included')}</span>
          <span className="flex items-center gap-1.5"><Minus size={13} style={{ color: '#8a8578' }} /> {tx('parcial / depende', 'partial / depends')}</span>
          <span className="flex items-center gap-1.5"><X size={13} style={{ color: '#e05d5d' }} /> {tx('no, o con costo extra', 'no, or at extra cost')}</span>
        </div>
      </div>
    </section>
  )
}

export default function PorQuePub() {
  const { lang, fijar, tx } = useLangPub()
  return (
    <div className="pub min-h-screen">
      <style>{CSS_PUB}</style>
      <NavPub lang={lang} fijar={fijar} tx={tx} activo="/por-que-milepay" />
      <header className="relative overflow-hidden pb-16 pt-[124px] text-center" style={{ background: NAVY_DEEP, color: CREAM }}>
        <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(900px 500px at 50% 0%,rgba(201,162,75,.16),transparent 60%)' }} />
        <div className="wrap-pub relative">
          <span className="rev mx-auto mb-6 grid h-14 w-14 place-items-center rounded-2xl" style={{ background: `linear-gradient(135deg,${GOLD},#a9863a)` }}><Award size={28} style={{ color: NAVY_DEEP }} /></span>
          <h1 className="rev mx-auto mb-5 max-w-[900px] text-[clamp(34px,4.6vw,56px)] font-bold">{tx('Por qué MilePay y ', 'Why MilePay and ')}<em className="not-italic" style={{ color: GOLD }}>{tx('no otra compañía', 'not another company')}</em></h1>
          <p className="rev mx-auto mb-8 max-w-[640px] text-[18px] leading-relaxed" style={{ color: 'rgba(248,243,235,.78)' }}>{tx('Porque no te vendemos un software genérico: te entregamos el sistema que nosotros mismos construimos para operar materiales a granel — y lo respaldamos en tu idioma.', 'Because we do not sell you generic software: we hand you the system we built ourselves to run bulk materials — and we stand behind it in your language.')}</p>
          <div className="rev flex flex-wrap items-center justify-center gap-3.5">
            <a href="/#demo" className="rounded-[11px] px-7 py-[15px] text-[15.5px] font-semibold" style={{ background: GOLD, color: NAVY_DEEP, boxShadow: '0 10px 30px -10px rgba(201,162,75,.5)' }}>{tx('Solicitar demo', 'Request demo')}</a>
            <a href="/sistema" className="inline-flex items-center gap-2 rounded-[11px] border px-6 py-[15px] text-[15.5px] font-semibold" style={{ color: CREAM, borderColor: 'rgba(248,243,235,.24)' }}>{tx('Ver el sistema', 'See the system')} <ArrowRight size={15} /></a>
          </div>
        </div>
      </header>
      <Ventajas tx={tx} />
      <Comparativa tx={tx} />
      <BandaCTA tx={tx} />
      <FooterPub tx={tx} />
    </div>
  )
}
