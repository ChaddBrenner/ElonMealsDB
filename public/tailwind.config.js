/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,js}"],
  theme: {
    extend: {
      backgroundImage: {
        'dashboard': 'linear-gradient(#ee0979, #ff6a00)',
      }
    },
  },
  plugins: [],
}