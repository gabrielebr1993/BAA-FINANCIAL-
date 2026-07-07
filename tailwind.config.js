/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
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
      },
      boxShadow: {
        // sombras Mercury casi imperceptibles
        card: '0 1px 2px rgba(0,0,0,0.04)',
        cardhover: '0 4px 14px rgba(0,0,0,0.06)',
      },
    },
  },
  plugins: [],
}
