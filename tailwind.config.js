/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Redirige "indigo" (el color primario/de marca usado en toda la app)
      // a variables CSS. Cuando el local configura un colorPrimario custom,
      // src/utils/theme.ts las setea en runtime; si no, caen al valor por
      // defecto (el indigo real de Tailwind) y no cambia nada visualmente.
      colors: {
        indigo: {
          50:  'var(--color-primary-50, #eef2ff)',
          100: 'var(--color-primary-100, #e0e7ff)',
          200: 'var(--color-primary-200, #c7d2fe)',
          300: 'var(--color-primary-300, #a5b4fc)',
          400: 'var(--color-primary-400, #818cf8)',
          500: 'var(--color-primary-500, #6366f1)',
          600: 'var(--color-primary-600, #4f46e5)',
          700: 'var(--color-primary-700, #4338ca)',
          800: 'var(--color-primary-800, #3730a3)',
          900: 'var(--color-primary-900, #312e81)',
        },
      },
    },
  },
  plugins: [],
}