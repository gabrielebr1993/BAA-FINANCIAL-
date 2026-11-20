/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    // `fold` = iPhone Duo abierto (pantalla interna ~626pt) y tablets chicas: 2
    // columnas sin pasar todavía al layout de escritorio. Se declara ANTES de sm
    // para que el orden del CSS sea de menor a mayor.
    screens: { fold: '600px', sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' },
    extend: {
      colors: {
        // Rediseño móvil 2026 (Bloque 1): tokens mp-* (ver src/styles/tokens.css).
        mp: {
          navy: '#0B1628',
          'navy-2': '#12213A',
          gold: '#C9A24A',
          cream: '#F3EFE6',
          ink: '#0B1628',
          'ink-2': '#7A776F',
          line: '#E6E1D2',
          blue: '#2B4C8C',
          green: '#2E9E6B',
          amber: '#D9822B',
          red: '#E0533D',
        },
        brand: {
          navy: '#13233f',
          gold: '#c9a24b',
          'navy-700': '#1c3a63',
          'navy-900': '#0d1930',
          steel: '#3d5a80',
          'steel-soft': '#7f9cc0',
        },
        surface: {
          light: '#fafafa',
          card: '#ffffff',
          dark: '#0f1729',
          'dark-card': '#1b2b45',
        },
        // Tonos de acento derivados de la marca (sin azul genérico).
        accent: {
          indigo: '#3d5a80',
          soft: '#7f9cc0',
        },
        // Rediseño home/login 2026 (tokens `rd-*`). Navy + colores por módulo.
        rd: {
          navy: '#0D2340',          // fondo hero
          'navy-card': '#12305A',   // tarjetas sobre navy
          'navy-line': '#2A4670',   // líneas sobre navy
          'navy-sub': '#A9B8CC',    // texto secundario sobre navy
          bg: '#F5F8FB',            // fondo claro
          ink: '#0E1B2C',           // texto
          'ink-sub': '#5A6778',     // texto secundario claro
          line: '#DCE3EB',          // líneas claras
          card: '#FFFFFF',          // tarjetas claras
          parcel: '#3D8BFF', 'parcel-soft': '#EAF2FF',   // Última milla
          freight: '#F2A900', 'freight-soft': '#FFF5DB', // Freight
          wh: '#2BC48A', 'wh-soft': '#E4F8EF',           // Warehouse
          ecom: '#9B6BFF', 'ecom-soft': '#F1EAFF',       // Ecommerce
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Rediseño home/login: Sora para títulos, JetBrains Mono para etiquetas/números.
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        // Rediseño 2026: SOLO estos tres radios en las pantallas nuevas.
        pill: '999px',
        card: '24px',
        row: '18px',
        bubble: '20px',
      },
      boxShadow: {
        // sombras Mercury casi imperceptibles
        card: '0 1px 2px rgba(0,0,0,0.04)',
        cardhover: '0 4px 14px rgba(0,0,0,0.06)',
        // Rediseño 2026: sombra de la tab bar flotante.
        float: '0 6px 20px rgba(11,22,40,.12)',
      },
      keyframes: {
        'slide-up': {
          '0%': { transform: 'translateY(1rem)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.25s ease-out',
      },
    },
  },
  plugins: [],
}
