// Exporta a Excel los DATOS BANCARIOS (nombre completo, SSN, banco, tipo de
// cuenta, número de cuenta y ruta) de uno o varios registros (choferes o
// managers). `registros` = [{ nombre, verificacion }]. Datos sensibles.
import { exportarExcel } from './exportar'

const tipoCuentaLabel = (t) => (t === 'savings' ? 'Ahorros' : t === 'checking' ? 'Corriente' : (t || ''))

export function exportarDatosBancarios(registros, nombreArchivo = 'datos-bancarios') {
  const rows = (registros || []).map((r) => {
    const v = r.verificacion || {}
    return {
      'Nombre completo': v.nombreCompleto || r.nombre || '',
      'Nombre (sistema)': r.nombre || '',
      SSN: v.tieneSSN ? (v.ssn || '') : '',
      Banco: v.bancoNombre || '',
      'Tipo de cuenta': tipoCuentaLabel(v.tipoCuenta),
      'Número de cuenta': v.cuentaNumero || '',
      'Número de ruta (routing)': v.rutaNumero || '',
      Teléfono: v.telefono || '',
      Email: v.email || '',
    }
  })
  exportarExcel(nombreArchivo, [{ nombre: 'Datos bancarios', rows }])
}
