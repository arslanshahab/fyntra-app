import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand palette — calm trust-blue chosen for a child-safety product.
        // Tracks Tailwind's sky-500/600/700 stops. Used by primary actions.
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
        },
        // Semantic attendance status palette — see README §10.
        // Used by Badge and other status surfaces. Anything outside this
        // palette should not represent attendance state.
        status: {
          present: '#16a34a', // soft green — child is at school
          late: '#d97706', // muted amber — late but accounted for
          notyet: '#9ca3af', // neutral grey — pre-arrival, no alarm
          unverified: '#64748b', // slate — device offline, can't confirm
          absent: '#dc2626', // deep red — child has not arrived (alarm)
          alarm: '#dc2626', // deep red — device down, missed pickup
        },
      },
      fontFamily: {
        // Latin / English UI font. Step 2 wires the locale-driven swap.
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Urdu UI font. Loaded as a webfont in step 2's theme bootstrap.
        urdu: ['"Noto Nastaliq Urdu"', '"Jameel Noori Nastaleeq"', 'serif'],
      },
    },
  },
  plugins: [],
}

export default config
