// Logros del chofer (gamificación) — vista compacta para Inicio y completa para
// Performance. Todo sale de sus propias semanas (utils/logrosChofer.js).
import { Flame, Target, Trophy, Medal, Package, Truck, Star, CalendarCheck, ShieldCheck, Lock } from 'lucide-react'
import { useLang } from '../i18n'
import { num } from '../utils/format'

const ICONOS = { flame: Flame, target: Target, trophy: Trophy, medal: Medal, package: Package, truck: Truck, star: Star, calendar: CalendarCheck, shield: ShieldCheck }

function Insignia({ i, t }) {
  const Icon = ICONOS[i.icono] || Star
  return (
    <div className={`flex min-w-0 flex-col items-center rounded-2xl p-3 text-center ${i.ganada ? 'bg-white shadow-card ring-1 ring-brand-gold/40 dark:bg-surface-dark-card' : 'bg-slate-100/70 dark:bg-slate-800/50'}`} title={t(i.desc)}>
      <span className={`relative grid h-12 w-12 place-items-center rounded-full ${i.ganada ? 'lg-pill-on text-brand-gold' : 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500'}`}>
        <Icon size={22} strokeWidth={2} />
        {!i.ganada && <Lock size={12} strokeWidth={2.4} className="absolute -bottom-0.5 -right-0.5 rounded-full bg-white p-0.5 text-slate-500 dark:bg-slate-800" />}
      </span>
      <span className={`mt-2 text-[12px] font-bold leading-tight ${i.ganada ? 'text-brand-navy dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>{t(i.titulo)}</span>
      <span className="mt-0.5 line-clamp-2 text-[10.5px] leading-snug text-slate-400">{t(i.desc)}</span>
      {!i.ganada && (
        <span className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-label={`${Math.round(i.progreso * 100)}%`}>
          <span className="block h-full rounded-full bg-brand-gold" style={{ width: `${Math.round(i.progreso * 100)}%` }} />
        </span>
      )}
    </div>
  )
}

export default function LogrosChofer({ logros, completo = false }) {
  const { t } = useLang()
  if (!logros) return null
  const L = logros
  const pctHito = Math.round(L.progresoHito * 100)

  return (
    <section className="mb-4" aria-label={t('Mis logros')}>
      {/* Racha + reto de la semana */}
      <div className="grid grid-cols-1 gap-3 fold:grid-cols-2">
        <div className="lg-sheen relative overflow-hidden rounded-card bg-brand-navy p-5 text-white shadow-card">
          <div className="flex items-center gap-3">
            <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-2xl ${L.racha > 0 ? 'bg-gradient-to-br from-amber-400 to-rose-500' : 'bg-white/10'}`}>
              <Flame size={28} strokeWidth={2.1} className={L.racha > 0 ? 'text-white' : 'text-slate-400'} />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">{t('Racha sin claims')}</div>
              <div className="font-display text-3xl font-extrabold leading-none text-brand-gold">
                {num(L.racha)} <span className="text-base font-bold text-white">{L.racha === 1 ? t('semana') : t('semanas')}</span>
              </div>
              <div className="mt-1 text-xs text-slate-300">{t('Tu mejor racha')}: {num(L.mejorRacha)}</div>
            </div>
          </div>
          {L.esRecord && (
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-pill bg-brand-gold px-3 py-1 text-xs font-bold text-brand-navy">
              <Trophy size={14} strokeWidth={2.2} /> {t('¡Nuevo récord de paquetes esta semana!')}
            </div>
          )}
        </div>

        <div className="rounded-card border border-slate-200/80 bg-white p-5 shadow-card dark:border-slate-700/60 dark:bg-surface-dark-card">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400"><Target size={14} strokeWidth={2} className="text-brand-gold" /> {t('Reto de la semana')}</div>
          <div className="mt-1.5 text-base font-bold leading-snug text-brand-navy dark:text-white">{t(L.reto.titulo)}</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t(L.reto.desc)}</div>
          {L.siguienteHito && (
            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span><Package size={12} strokeWidth={2} className="mr-1 inline" />{num(L.totalPaquetes)} {t('paquetes')}</span>
                <span className="font-semibold text-brand-navy dark:text-slate-200">{t('Meta')}: {num(L.siguienteHito)}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" role="progressbar" aria-valuenow={pctHito} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full rounded-full bg-gradient-to-r from-brand-gold to-amber-400 transition-all" style={{ width: `${pctHito}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Insignias */}
      <div className="mt-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Mis insignias')}</h2>
          <span className="text-xs font-semibold text-slate-400">{L.ganadas}/{L.insignias.length}</span>
        </div>
        {completo ? (
          <div className="grid grid-cols-3 gap-2.5 fold:grid-cols-5 lg:grid-cols-9">
            {L.insignias.map((i) => <Insignia key={i.k} i={i} t={t} />)}
          </div>
        ) : (
          <div className="scroll-thin -mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1">
            {[...L.insignias].sort((a, b) => Number(b.ganada) - Number(a.ganada) || b.progreso - a.progreso).map((i) => (
              <div key={i.k} className="w-[118px] shrink-0"><Insignia i={i} t={t} /></div>
            ))}
          </div>
        )}
      </div>

      {completo && L.mejorSemana && (
        <div className="mt-4 grid grid-cols-2 gap-2.5 fold:grid-cols-4">
          <Record label={t('Mejor semana')} valor={`${num(L.mejorSemana.paquetes)} ${t('paq.')}`} sub={L.mejorSemana.semana} />
          <Record label={t('Semanas sin claims')} valor={num(L.semanasPerfectas)} />
          <Record label={t('Récords superados')} valor={num(L.recordsRotos)} />
          <Record label={t('Paquetes en total')} valor={num(L.totalPaquetes)} />
        </div>
      )}
    </section>
  )
}

function Record({ label, valor, sub }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-slate-700/60 dark:bg-surface-dark-card">
      <div className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-brand-navy dark:text-white">{valor}</div>
      {sub && <div className="truncate text-[11px] text-slate-400">{sub}</div>}
    </div>
  )
}
