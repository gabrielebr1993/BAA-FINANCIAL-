// Esfera estilo JARVIS: núcleo dorado con anillos orbitando sobre navy.
// Reacciona según `estado`: 'idle' | 'listening' | 'speaking' | 'thinking'.
// `alerta` (ámbar) para el mini-orbe del Panel de Control cuando hay algo crítico.
const COLORES = {
  idle: '#c9a24b',
  listening: '#38bdf8',
  speaking: '#c9a24b',
  thinking: '#c9a24b',
  alerta: '#f59e0b',
}

export default function JarvisSphere({ estado = 'idle', size = 180, alerta = false }) {
  const activo = estado === 'speaking' || estado === 'listening'
  const color = alerta ? COLORES.alerta : COLORES[estado] || COLORES.idle
  const dur = estado === 'thinking' ? '1.4s' : estado === 'listening' ? '2.2s' : '3.4s'

  return (
    <div className="jv-wrap" style={{ width: size, height: size }}>
      <style>{`
        @keyframes jv-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes jv-spin-r { from { transform: rotate(360deg); } to { transform: rotate(0deg); } }
        @keyframes jv-pulse { 0%,100% { transform: scale(1); opacity: .95; } 50% { transform: scale(1.06); opacity: 1; } }
        @keyframes jv-glow { 0%,100% { opacity: .35; } 50% { opacity: .7; } }
        .jv-wrap { position: relative; display: grid; place-items: center; }
        .jv-ring { position: absolute; inset: 0; border-radius: 50%; border: 2px solid transparent; }
        .jv-core { border-radius: 50%; background: radial-gradient(circle at 35% 30%, #ffe9b0, ${color} 55%, #8a6c25 100%); box-shadow: 0 0 32px ${color}88, inset 0 0 18px #00000055; }
        .jv-halo { position: absolute; border-radius: 50%; background: radial-gradient(circle, ${color}55, transparent 70%); animation: jv-glow 2.6s ease-in-out infinite; }
      `}</style>

      {/* halo */}
      <div className="jv-halo" style={{ width: size * 1.25, height: size * 1.25 }} />

      {/* anillos orbitando */}
      <div className="jv-ring" style={{ borderTopColor: color, borderRightColor: `${color}66`, animation: `jv-spin ${dur} linear infinite` }} />
      <div className="jv-ring" style={{ inset: size * 0.11, borderBottomColor: color, borderLeftColor: `${color}55`, animation: `jv-spin-r ${dur} linear infinite` }} />
      <div className="jv-ring" style={{ inset: size * 0.22, borderTopColor: `${color}aa`, animation: `jv-spin ${parseFloat(dur) * 1.5}s linear infinite` }} />

      {/* núcleo */}
      <div
        className="jv-core"
        style={{ width: size * 0.5, height: size * 0.5, animation: activo ? 'jv-pulse 1.1s ease-in-out infinite' : 'jv-pulse 3.2s ease-in-out infinite' }}
      />
    </div>
  )
}
