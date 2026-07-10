// Cliente de los endpoints serverless de Stripe. La clave secreta vive SOLO en el
// servidor; aquí solo enviamos el token de sesión y recibimos referencias/estado.
import { auth } from '../firebase'

async function post(url, body) {
  const token = await auth.currentUser?.getIdToken()
  if (!token) return { ok: false, error: 'Sesión no válida. Vuelve a iniciar sesión.' }
  let resp
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body || {}),
    })
  } catch (e) {
    return { ok: false, error: 'No se pudo conectar con el servidor: ' + (e?.message || '') }
  }
  const data = await resp.json().catch(() => ({ ok: false, error: 'Respuesta no válida del servidor.' }))
  return data
}

export const stripeCrearCuenta = (body) => post('/api/stripe-crear-cuenta', body)
export const stripeOnboardingLink = (body) => post('/api/stripe-onboarding-link', body)
export const stripeEstado = (body) => post('/api/stripe-estado', body)
export const stripeConfig = () => post('/api/stripe-config', {})
export const stripePagar = (body) => post('/api/stripe-pagar', body)
