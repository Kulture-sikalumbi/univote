/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#1C4E80',
          dark: '#153B60',
          light: '#2E6DA8',
        },
      },
    },
  },
  plugins: [],
};
