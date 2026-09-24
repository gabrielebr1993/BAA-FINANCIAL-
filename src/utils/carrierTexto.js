// ============================================================================
// Texto adaptado a la compañía activa (Multi-Company).
//
// Las pantallas compartidas nacieron con Gofo y dicen "Gofo" en muchos
// textos ("lo que Gofo cobra", "Ingreso neto (Gofo)", …). En vez de duplicar
// pantallas, `conCarrier(texto)` sustituye la palabra "Gofo" por el nombre de
// la compañía activa (con SpeedX: "SpeedX"). Con Gofo el texto queda igual.
// Se usa envolviendo la traducción: conCarrier(t('Lo que Gofo cobra')).
// ============================================================================
import { CARRIERS } from '../carriers/index'

export function nombreCarrierActivo() {
  try {
    const v = localStorage.getItem('mp_carrier')
    return (CARRIERS[v] && CARRIERS[v].nombre) || 'Gofo'
  } catch {
    return 'Gofo'
  }
}

export const conCarrier = (s) => String(s ?? '').split('Gofo').join(nombreCarrierActivo())
