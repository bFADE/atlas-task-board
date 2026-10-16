/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        surface: v('surface'),
        panel: v('panel'),
        line: v('line'),
        hover: v('hover'),
        fg: v('fg'),
        muted: v('muted'),
        accent: v('accent'),
        danger: v('danger'),
      },
      fontFamily: {
        sans: [
          'ui-sans-serif',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Helvetica',
          '"Apple Color Emoji"',
          'Arial',
          'sans-serif',
          '"Segoe UI Emoji"',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,15,15,0.06), 0 0 0 1px rgba(15,15,15,0.06)',
        pop: '0 0 0 1px rgba(15,15,15,0.05), 0 3px 6px rgba(15,15,15,0.1), 0 9px 24px rgba(15,15,15,0.2)',
      },
    },
  },
  plugins: [],
};
