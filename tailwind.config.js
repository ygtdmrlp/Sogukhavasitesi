/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./views/**/*.ejs"],
  theme: {
    extend: {
      colors: {
        'ice-blue': '#f0f9ff',
        'cold-blue': '#0ea5e9',
        'deep-blue': '#075985',
        'cold-gray': '#64748b',
      }
    },
  },
  plugins: [],
}
