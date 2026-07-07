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
          light: '#fafafa',
          card: '#ffffff',
          dark: '#0f1729',
          'dark-card': '#1b2b45',
        },
        accent: {
          indigo: '#5b6cc4',
          soft: '#8b96d6',
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
