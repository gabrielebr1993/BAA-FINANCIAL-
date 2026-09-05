/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
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
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
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
