// Página dedicada a TODO lo de Stripe (pagos a choferes vía Stripe Connect).
// Centraliza aquí la configuración que antes estaba dispersa en Configuración.
// Solo el dueño de la empresa o el súper-admin. La clave secreta vive en el
// servidor (Vercel); aquí solo se consulta el estado.
import { useState, useEffect } from 'react'
import { CreditCard, CheckCircle2, XCircle, RefreshCw, ShieldCheck, Info, Wallet } from 'lucide-react'
import { useData } from '../DataContext'
import { useAuth } from '../AuthContext'
import { stripeConfig } from '../utils/stripe'
import { Card, PageTitle, Boton, Aviso, Badge, Spinner } from '../components/ui'
import { useLang } from '../i18n'

export default function Stripe() {
  const { t } = useLang()
  const { empresaActiva } = useData()
  const { perfil, esSuperAdmin } = useAuth()
  const puedeStripe = esSuperAdmin || perfil?.role === 'owner'
  const [stripeInfo, setStripeInfo] = useState(null) // { configurado, test } | { error }
  const [cargandoStripe, setCargandoStripe] = useState(false)

  const revisarStripe = async () => {
    setCargandoStripe(true)
    try {
      const r = await stripeConfig()
      setStripeInfo(r.ok ? r : { error: r.error })
    } catch (e) {
      setStripeInfo({ error: e.message })
    } finally { setCargandoStripe(false) }
  }
  useEffect(() => { if (puedeStripe) revisarStripe() }, [puedeStripe])

  if (!puedeStripe) {
    return (
      <div>
        <PageTitle>{t('Stripe · Pagos')}</PageTitle>
        <Aviso tipo="warn">{t('Solo el ')}<b>{t('dueño')}</b>{t(' de la empresa o el súper-admin pueden ver la configuración de Stripe.')}</Aviso>
      </div>
    )
  }

  return (
    <div>
      <PageTitle right={empresaActiva && <span className="text-sm text-slate-500 dark:text-slate-400">{t('Empresa:')} <b className="text-brand-navy dark:text-slate-200">{empresaActiva.nombre}</b></span>}>{t('Stripe · Pagos')}</PageTitle>

      <div className="grid grid-cols-1 gap-4">
        {/* Estado de la conexión con Stripe */}
        <Card className="p-5">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <CreditCard size={18} strokeWidth={1.8} className="text-brand-gold" />
            <h3 className="m-0 text-base font-bold text-brand-navy dark:text-slate-100">{t('Conexión con Stripe')}</h3>
            {stripeInfo && !stripeInfo.error && (
              stripeInfo.configurado
                ? <Badge color="green"><span className="inline-flex items-center gap-1"><CheckCircle2 size={13} strokeWidth={2} /> {t('Configurado')}</span></Badge>
                : <Badge color="red"><span className="inline-flex items-center gap-1"><XCircle size={13} strokeWidth={2} /> {t('No configurado')}</span></Badge>
            )}
            {stripeInfo && !stripeInfo.error && stripeInfo.configurado && <Badge color={stripeInfo.test ? 'gold' : 'slate'}>{stripeInfo.test ? t('Modo TEST') : t('Producción')}</Badge>}
            <Boton variant="ghost" className="ml-auto px-2.5 py-1 text-xs" onClick={revisarStripe} disabled={cargandoStripe}>
              {cargandoStripe ? <><Spinner /> {t('Revisando…')}</> : <><RefreshCw size={14} strokeWidth={1.8} /> {t('Revisar')}</>}
            </Boton>
          </div>
          <p className="mb-2 text-sm text-slate-500 dark:text-slate-400">
            {t('Los pagos a choferes se procesan con ')}<b>Stripe Connect</b>{t('. Los ')}<b>{t('datos bancarios los maneja Stripe')}</b>{t(' — MilePay nunca los ve ni los guarda; solo el estado (verificado / pendiente).')}
          </p>
          {stripeInfo?.error && <Aviso tipo="warn">{t('No se pudo consultar el estado de Stripe:')} {stripeInfo.error}</Aviso>}
          {stripeInfo && !stripeInfo.error && !stripeInfo.configurado && (
            <Aviso tipo="warn">{t('Falta ')}<b>STRIPE_SECRET_KEY</b>{t(' en Vercel (usa una clave de ')}<b>TEST</b> <code>sk_test_…</code>{t(' para probar) y activar ')}<b>Connect</b>{t(' en tu panel de Stripe.')}</Aviso>
          )}
        </Card>

        {/* Cómo funciona / pasos */}
        <Card className="p-5">
          <h3 className="m-0 mb-3 flex items-center gap-2 text-base font-bold text-brand-navy dark:text-slate-100"><Wallet size={18} strokeWidth={1.8} className="text-brand-gold" /> {t('Cómo pagar a un chofer')}</h3>
          <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300">
            <li>{t('1. Registra a cada chofer desde su ')}<b>{t('perfil → “Verificación y pago” → “Invitar a registrar pago”')}</b>.</li>
            <li>{t('2. El chofer completa sus datos bancarios en Stripe y su estado pasa a ')}<b>{t('verificado')}</b>.</li>
            <li>{t('3. En ')}<b>{t('Pagos')}</b>{t(' podrás pagarle (por ahora solo en modo ')}<b>TEST</b>{t('; los pagos reales están deshabilitados).')}</li>
          </ul>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <ShieldCheck size={15} strokeWidth={1.8} className="mt-0.5 flex-shrink-0 text-brand-gold" />
            {t('Seguridad: la ')}<b>{t('clave secreta de Stripe')}</b>{t(' solo vive en el servidor (variable de entorno en Vercel). Ningún dato bancario del chofer se guarda en MilePay.')}
          </div>
        </Card>
      </div>
    </div>
  )
}
