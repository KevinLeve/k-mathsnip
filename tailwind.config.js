/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/**/*.{tsx,ts,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Derived directly from the app icon (navy #002056, accent #0075fe) so the window
        // chrome, icon, and UI read as one consistent brand rather than default Tailwind blue.
        brand: {
          50: '#eaf3ff',
          100: '#d6e8ff',
          200: '#adcfff',
          300: '#7ab3ff',
          400: '#3d94ff',
          500: '#0075fe',
          600: '#0060d4',
          700: '#0048a3',
          800: '#003370',
          900: '#002056',
          950: '#00133a',
        },
        // Cool, barely-tinted neutrals for page backgrounds — a hint of the brand's navy hue
        // instead of flat Tailwind gray, without turning whole screens saturated blue.
        paper: '#f7f9fc',
        ink: {
          DEFAULT: '#0b0f1a',
          raised: '#121726',
        },
      },
    },
  },
  plugins: [],
};
