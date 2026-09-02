/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    container: {
      center: true,
      padding: '1rem',
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      maxWidth: {
        'container-form': '48rem',
      },
      fontSize: {
        'label-sm': ['0.75rem', { lineHeight: '1rem', fontWeight: '500' }],
        'label-md': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '500' }],
        'label-lg': ['1rem', { lineHeight: '1.4rem', fontWeight: '600' }],
        'body-sm': ['0.875rem', { lineHeight: '1.25rem', fontWeight: '400' }],
        'body-md': ['1rem', { lineHeight: '1.5rem', fontWeight: '400' }],
        'body-lg': ['1.125rem', { lineHeight: '1.625rem', fontWeight: '400' }],
        'title-sm': ['1.125rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        'title-md': ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'title-lg': ['1.375rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        'title-xl': ['1.5rem', { lineHeight: '2rem', fontWeight: '600' }],
        'headline-sm': ['1.5rem', { lineHeight: '2rem', fontWeight: '700' }],
        'headline-md': ['1.75rem', { lineHeight: '2.25rem', fontWeight: '700' }],
        'headline-lg': ['2rem', { lineHeight: '2.5rem', fontWeight: '700' }],
        'display-sm': ['2.5rem', { lineHeight: '3rem', fontWeight: '700' }],
      },
    },
  },
  plugins: [],
};
