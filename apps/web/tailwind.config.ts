import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — warm teal-green. Hue tuned around 162° so darker steps read
        // as "warm teal" rather than desaturated petrol blue. brand-600 is the
        // primary CTA; AA-passing (6.4:1) for white text.
        brand: {
          50: '#EEF8F2',
          100: '#D9EFE3',
          200: '#B5DEC8',
          300: '#87CAA8',
          400: '#58AC85',
          500: '#1F8C66',
          600: '#136C56',
          700: '#0E5141',
          800: '#0A3729',
          900: '#082519',
        },
        // Accent — saffron. Used sparingly for warm moments (success ticks,
        // "all clear" hero, focus highlights). Never as a white-text CTA on
        // the lighter steps; accent-700 is the only step safe for that.
        accent: {
          50: '#FBF1DD',
          100: '#F6E1B5',
          500: '#E8A44A',
          600: '#C68830',
          700: '#9E6A21',
        },
        // Warm stone — replaces slate as the neutral. Tuned to feel inhabited
        // rather than server-rendered; stone-500 passes AA on stone-50.
        stone: {
          50: '#FAF8F4',
          100: '#F1ECE3',
          200: '#E2DBCD',
          300: '#C9C0AE',
          400: '#A39787',
          500: '#756B58',
          700: '#3F3A2E',
          900: '#1C1812',
        },
        // Semantic attendance + system status palette. All values pass AA
        // contrast for text-on-white. Decorative use (dots, stripes) is fine
        // at any size.
        status: {
          present: '#2F7C4F',
          late: '#A1671B',
          notyet: '#6E6553',
          unverified: '#5C6470',
          absent: '#B22D26',
          // status-alarm is the system-error twin of status-absent (offline
          // devices, form errors, destructive actions). Same value today;
          // kept distinct so future iterations can split them.
          alarm: '#B22D26',
        },
      },
      fontFamily: {
        // Display face for headings (24px+). Inter Tight is geometrically
        // matched to Inter; same family DNA, tighter optical for display.
        display: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        // Body / UI face for English. System fallbacks cover the brief
        // window before Inter loads.
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Numeric mono for times, durations, IDs, OTP digits. Prevents the
        // digit-wobble on changing live values.
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        // Urdu UI face. Slice 1 does not optimize Urdu; this is unchanged.
        urdu: ['"Noto Nastaliq Urdu"', '"Jameel Noori Nastaleeq"', 'serif'],
      },
      fontSize: {
        // Eyebrow / micro label. Use uppercase + tracking-wide already
        // baked into the line-height for visual rhythm.
        micro: ['11px', { lineHeight: '14px', letterSpacing: '0.06em' }],
        // Display sizes — only for the one hero moment per screen. Pair
        // with font-display class.
        display: ['32px', { lineHeight: '36px', letterSpacing: '-0.02em' }],
        'display-lg': ['40px', { lineHeight: '44px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        // Hero surfaces (login card, parent status hero). Tailwind defaults
        // cover xs–3xl; this adds the one missing step for "premium hero".
        hero: '28px',
      },
      boxShadow: {
        // Stone-tinted elevation. Three tiers replace the bare shadow-sm.
        'elev-1': '0 1px 2px rgba(28, 24, 18, 0.04)',
        'elev-2': '0 1px 2px rgba(28, 24, 18, 0.04), 0 4px 12px rgba(28, 24, 18, 0.05)',
        'elev-3': '0 2px 4px rgba(28, 24, 18, 0.05), 0 12px 32px rgba(28, 24, 18, 0.08)',
      },
      keyframes: {
        // Used on LiveTapFeed entries so new taps fade in instead of popping.
        // Pair with motion-safe: so reduced-motion users get instant rendering.
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 240ms ease-out both',
      },
    },
  },
  plugins: [],
}

export default config
