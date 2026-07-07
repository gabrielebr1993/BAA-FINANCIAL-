// Layout principal con menú lateral (sidebar). Muestra solo las secciones
// permitidas para el usuario según sus permisos.
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { SECCIONES, COLORS } from '../constants'

export default function Layout({ children }) {
  const { perfil, puede, cerrarSesion } = useAuth()
  const location = useLocation()
  const [abierto, setAbierto] = useState(false)

  const secciones = SECCIONES.filter((s) => puede(s.permiso))

  const linkStyle = (activo) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '11px 16px',
    color: activo ? COLORS.navy : '#dfe4ee',
    background: activo ? COLORS.gold : 'transparent',
    borderRadius: 8,
    textDecoration: 'none',
    fontWeight: activo ? 700 : 500,
    fontSize: 14.5,
  })

  const sidebar = (
    <aside
      style={{
        width: 232,
        background: COLORS.navy,
        color: '#fff',
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minHeight: '100vh',
        position: 'sticky',
        top: 0,
      }}
    >
      <div style={{ padding: '8px 8px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: COLORS.gold, color: COLORS.navy, display: 'grid', placeItems: 'center', fontWeight: 800 }}>
          G
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18 }}>Gofo</div>
          <div style={{ fontSize: 11, color: '#9fb0cc' }}>Gestión de facturas</div>
        </div>
      </div>
      {secciones.map((s) => (
        <Link key={s.path} to={s.path} style={linkStyle(location.pathname === s.path)} onClick={() => setAbierto(false)}>
          <span style={{ width: 20, textAlign: 'center' }}>{s.icon}</span>
          {s.label}
        </Link>
      ))}
      <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid #24365a', fontSize: 13 }}>
        <div style={{ color: '#dfe4ee', fontWeight: 600 }}>{perfil?.nombre || 'Usuario'}</div>
        <div style={{ color: '#8ea3c6', fontSize: 12, marginBottom: 8 }}>
          {perfil?.role || 'usuario'} · {perfil?.email}
        </div>
        <button
          onClick={cerrarSesion}
          style={{ width: '100%', padding: 9, background: 'transparent', color: '#fff', border: '1px solid #3a4d73', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )

  return (
    <div style={{ display: 'flex', background: COLORS.bg, minHeight: '100vh', fontFamily: 'system-ui, -apple-system, sans-serif', color: COLORS.text }}>
      {/* barra superior móvil */}
      <div
        style={{
          display: 'none',
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 20,
          background: COLORS.navy,
          color: '#fff',
          padding: '10px 14px',
          alignItems: 'center',
          gap: 12,
        }}
        className="gofo-mobilebar"
      >
        <button onClick={() => setAbierto((v) => !v)} style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 22, cursor: 'pointer' }}>
          ☰
        </button>
        <span style={{ fontWeight: 800 }}>Gofo</span>
      </div>

      <div className="gofo-sidebar" style={{ display: 'block' }}>
        {sidebar}
      </div>

      {/* drawer móvil */}
      {abierto && (
        <div
          onClick={() => setAbierto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 30 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: 232 }}>
            {sidebar}
          </div>
        </div>
      )}

      <main style={{ flex: 1, padding: 24, maxWidth: '100%', overflowX: 'hidden' }}>{children}</main>

      <style>{`
        @media (max-width: 820px) {
          .gofo-sidebar { display: none !important; }
          .gofo-mobilebar { display: flex !important; }
          main { padding-top: 60px !important; }
        }
      `}</style>
    </div>
  )
}
