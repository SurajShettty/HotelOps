import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef2fb',
          100: '#d7e0f5',
          200: '#b0c1eb',
          300: '#82a0dd',
          400: '#5b82ce',
          500: '#3a63b8',
          600: '#2b4b96',
          700: '#233c78',
          800: '#1c2f5e',
          900: '#0f1c3d',
          950: '#0a1329',
        },
        gold: {
          50: '#fbf7ec',
          100: '#f5ecce',
          200: '#ead89b',
          300: '#dfc069',
          400: '#d4a942',
          500: '#c2932e',
          600: '#a17423',
          700: '#7f5a1f',
          800: '#68491f',
          900: '#583d1e',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        popover: '0 4px 6px -1px rgb(15 23 42 / 0.08), 0 10px 20px -5px rgb(15 23 42 / 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
