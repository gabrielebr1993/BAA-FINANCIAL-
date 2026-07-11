// Onboarding INCRUSTADO de Stripe Connect (embedded components): el registro del
// chofer se muestra DENTRO de la app, sin redirigir. Usa la clave PÚBLICA
// (VITE_STRIPE_PUBLISHABLE_KEY) + un client_secret de Account Session que crea el
// servidor (/api/stripe-account-session). Se carga bajo demanda (lazy).
import { useEffect, useState, useCallback } from 'react'
import { loadConnectAndInitialize } from '@stripe/connect-js'
import { ConnectComponentsProvider, ConnectAccountOnboarding } from '@stripe/react-connect-js'
import { stripeAccountSession } from '../utils/stripe'
import { Aviso, Spinner } from './ui'

export default function StripeOnboardingEmbedded({ companyId, driverId, onSalir }) {
  const pk = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY
  const [instancia, setInstancia] = useState(null)
  const [error, setError] = useState('')

  const fetchClientSecret = useCallback(async () => {
    const r = await stripeAccountSession({ companyId, driverId })
    if (!r.ok) throw new Error(r.error || 'No se pudo iniciar el registro incrustado.')
    return r.clientSecret
  }, [companyId, driverId])

  useEffect(() => {
    if (!pk) { setError('Falta la clave pública de Stripe (VITE_STRIPE_PUBLISHABLE_KEY) en Vercel.'); return }
    let vivo = true
    ;(async () => {
      try {
        const inst = loadConnectAndInitialize({
          publishableKey: pk,
          fetchClientSecret,
          appearance: { variables: { colorPrimary: '#c9a24b', fontFamily: 'inherit' } },
        })
        if (vivo) setInstancia(inst)
      } catch (e) { if (vivo) setError(e?.message || 'No se pudo cargar Stripe.') }
    })()
    return () => { vivo = false }
  }, [pk, fetchClientSecret])

  if (error) return <Aviso tipo="error">{error}</Aviso>
  if (!instancia) return <div className="flex items-center gap-2 py-4 text-sm text-slate-500"><Spinner /> Cargando registro seguro de Stripe…</div>

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700/60 dark:bg-slate-900">
      <ConnectComponentsProvider connectInstance={instancia}>
        <ConnectAccountOnboarding onExit={() => onSalir?.()} />
      </ConnectComponentsProvider>
    </div>
  )
}
