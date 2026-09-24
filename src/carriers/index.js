// ============================================================================
// MILE PAY · REGISTRO DE COMPAÑÍAS (carriers) — arquitectura Multi-Company.
//
//   Mile Pay Core ──► Gofo Module ──► SpeedX Module ──► (futuros carriers)
//
// Cada compañía declara aquí su módulo: identidad (nombre/color), si está
// LISTA para operar y su ADAPTADOR (parser/reglas). El resto del sistema
// pregunta a este registro en vez de llenarse de `if company == ...`.
//
// CONTRATO del adaptador (lo que un carrier nuevo debe implementar):
//   parser: {
//     procesarFactura(archivo)   → { detalles, claims, driverSummary, sumas, totalOficial }
//     procesarFallidos(archivo)? → { fallidosPorChofer }
//     procesarRates(archivo)?    → { tarifas }
//     construirResumen(datos)    → resumen por chofer/ruta/ciudad
//     combinar(archivos)         → factura combinada + verificación (cuadra)
//   }
//   (Las firmas exactas son las que ya usa el flujo de Gofo; SpeedX definirá
//    las suyas TRAS analizar una factura real — regla: no inventar columnas.)
//
// GOFO: su adaptador RE-EXPORTA el flujo existente TAL CUAL (cero cambios de
// lógica, cálculos intactos). SpeedX queda declarado pero NO listo: su parser
// se construye únicamente después de analizar un archivo real.
//
// AISLAMIENTO DE DATOS: los registros nuevos llevan `carrier: '<id>'`. Los
// históricos NO tienen el campo y se interpretan como Gofo (compatibilidad
// total, sin migraciones): usar SIEMPRE `carrierDe(doc)` para leerlo.
// ============================================================================
import {
  procesarArchivo, procesarReporteFallidos, procesarArchivoPrecios,
  construirResumen, combinarArchivos,
} from '../utils/excel'
import { procesarArchivoSpeedX } from './speedx/parser'
import { construirResumenSpeedX } from './speedx/resumen'

export const CARRIERS = {
  gofo: {
    id: 'gofo',
    nombre: 'Gofo',
    color: '#c9a24b',
    descripcion: 'Facturas semanales de Gofo — el sistema actual, tal como funciona hoy.',
    listo: true,
    // Adaptador = el flujo EXISTENTE, sin tocar (los cálculos viven donde siempre).
    parser: {
      procesarFactura: procesarArchivo,
      procesarFallidos: procesarReporteFallidos,
      procesarRates: procesarArchivoPrecios,
      construirResumen,
      combinar: combinarArchivos,
    },
  },
  speedx: {
    id: 'speedx',
    nombre: 'SpeedX',
    color: '#2b4c8c',
    descripcion: 'Facturas semanales de SpeedX — pago por paquete y por parada, con fondo a 2 semanas.',
    listo: true, // parser construido y verificado contra una factura real (DFW_TTC_15.xlsx)
    // Adaptador propio: 1 archivo con 5 hojas, pago por paquete + stop, claims M2.
    parser: {
      procesarFactura: procesarArchivoSpeedX,
      construirResumen: construirResumenSpeedX,
    },
    // Etiquetas para las pantallas compartidas (mismos campos, otro significado).
    etiquetas: { individuales: '<1 lb', dobles: '≥1 lb', stopAdicional: 'Stop adicional' },
    // Fondo: la semana se cobra 14 días (2 semanas exactas) después de su fecha
    // fin (ejemplo real del dueño: semana 28 ago–4 sep → se cobra el 18 sep).
    // La fecha queda editable por factura en «Cobros y fondo».
    diasFondo: 14,
  },
}

export const CARRIER_DEFAULT = 'gofo'
export const listaCarriers = () => Object.values(CARRIERS)

// Carrier de un documento: los históricos (sin campo) son Gofo.
export const carrierDe = (doc) => (doc && doc.carrier) || 'gofo'
