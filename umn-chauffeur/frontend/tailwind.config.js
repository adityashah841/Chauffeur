/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        maroon: {
          DEFAULT: '#7A0019',
          dark: '#5a0013',
          light: '#9b0021',
        },
        gold: {
          DEFAULT: '#FFCC33',
          dark: '#e6b800',
          light: '#ffd966',
        },
      },
    },
  },
  plugins: [],
};
