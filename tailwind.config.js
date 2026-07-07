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
        },
        surface: {
          light: '#f4f5f7',
          card: '#ffffff',
          dark: '#0f1729',
          'dark-card': '#1b2b45',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)',
        cardhover: '0 4px 16px rgba(16,24,40,0.10)',
      },
    },
  },
  plugins: [],
}
