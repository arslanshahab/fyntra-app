import { useState } from 'react'
import { ArrowRight, Check, ChevronRight, LogIn, LogOut, Search } from 'lucide-react'

import { Avatar } from '../../components/atoms/Avatar'
import { Badge } from '../../components/atoms/Badge'
import { Button } from '../../components/atoms/Button'
import { Icon } from '../../components/atoms/Icon'
import { Input } from '../../components/atoms/Input'
import { Spinner } from '../../components/atoms/Spinner'
import { Switch } from '../../components/atoms/Switch'

const brandSteps = [
  { name: '50', value: '#EEF8F2' },
  { name: '100', value: '#D9EFE3' },
  { name: '200', value: '#B5DEC8' },
  { name: '300', value: '#87CAA8' },
  { name: '400', value: '#58AC85' },
  { name: '500', value: '#1F8C66' },
  { name: '600', value: '#136C56' },
  { name: '700', value: '#0E5141' },
  { name: '800', value: '#0A3729' },
  { name: '900', value: '#082519' },
]

const accentSteps = [
  { name: '50', value: '#FBF1DD' },
  { name: '100', value: '#F6E1B5' },
  { name: '500', value: '#E8A44A' },
  { name: '600', value: '#C68830' },
  { name: '700', value: '#9E6A21' },
]

const stoneSteps = [
  { name: '50', value: '#FAF8F4' },
  { name: '100', value: '#F1ECE3' },
  { name: '200', value: '#E2DBCD' },
  { name: '300', value: '#C9C0AE' },
  { name: '400', value: '#A39787' },
  { name: '500', value: '#756B58' },
  { name: '700', value: '#3F3A2E' },
  { name: '900', value: '#1C1812' },
]

const statusSteps = [
  { name: 'present', value: '#2F7C4F', label: 'At school' },
  { name: 'late', value: '#A1671B', label: 'Late' },
  { name: 'notyet', value: '#6E6553', label: 'Not yet' },
  { name: 'unverified', value: '#5C6470', label: 'Unverified' },
  { name: 'absent', value: '#B22D26', label: 'Absent' },
  { name: 'alarm', value: '#B22D26', label: 'System alarm' },
]

function Section({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-5">
      <div>
        <h2 className="font-display text-2xl font-semibold tracking-tight text-stone-900">
          {title}
        </h2>
        {subtitle ? <p className="mt-1 text-sm text-stone-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  )
}

function Swatch({ name, value, textOn }: { name: string; value: string; textOn?: 'light' | 'dark' }) {
  const text = textOn === 'dark' ? 'text-stone-900' : 'text-white'
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-stone-200">
      <div className={`flex h-16 items-end p-2 ${text}`} style={{ backgroundColor: value }}>
        <span className="font-mono text-xs">{name}</span>
      </div>
      <div className="bg-white px-2 py-1.5 font-mono text-[11px] text-stone-500">{value}</div>
    </div>
  )
}

export function StyleguidePage() {
  const [switchA, setSwitchA] = useState(true)
  const [switchB, setSwitchB] = useState(false)

  return (
    <main className="min-h-dvh bg-stone-50">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div>
            <p className="text-micro font-medium uppercase text-stone-500">Fyntra · Internal</p>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-stone-900">
              Design system — slice 1
            </h1>
          </div>
          <Badge tone="present">tokens live</Badge>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-16 px-6 py-10">
        {/* Color */}
        <Section
          title="Color"
          subtitle="Warm teal brand, saffron accent, stone neutrals, semantic status. Every status step passes AA on white."
        >
          <div className="space-y-6">
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                Brand · primary actions
              </p>
              <div className="grid grid-cols-5 gap-3 md:grid-cols-10">
                {brandSteps.map((s) => (
                  <Swatch key={s.name} name={s.name} value={s.value} textOn={Number(s.name) < 400 ? 'dark' : 'light'} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                Accent · saffron moments
              </p>
              <div className="grid grid-cols-5 gap-3">
                {accentSteps.map((s) => (
                  <Swatch key={s.name} name={s.name} value={s.value} textOn={Number(s.name) < 500 ? 'dark' : 'light'} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                Stone · neutrals
              </p>
              <div className="grid grid-cols-4 gap-3 md:grid-cols-8">
                {stoneSteps.map((s) => (
                  <Swatch key={s.name} name={s.name} value={s.value} textOn={Number(s.name) < 400 ? 'dark' : 'light'} />
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-stone-500">
                Status · semantic
              </p>
              <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
                {statusSteps.map((s) => (
                  <div key={s.name} className="overflow-hidden rounded-lg ring-1 ring-stone-200">
                    <div
                      className="flex h-16 items-end p-2 text-white"
                      style={{ backgroundColor: s.value }}
                    >
                      <span className="font-mono text-xs">{s.name}</span>
                    </div>
                    <div className="bg-white px-2 py-1.5 text-[11px] text-stone-700">
                      {s.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Typography */}
        <Section
          title="Typography"
          subtitle="Inter Tight for display, Inter for body, JetBrains Mono for numerics. Latin only this pass."
        >
          <div className="space-y-6 rounded-2xl bg-white p-8 ring-1 ring-stone-200 shadow-elev-1">
            <div>
              <p className="text-micro font-medium uppercase text-stone-500">display-lg · Inter Tight 700</p>
              <p className="mt-1 font-display text-display-lg font-bold text-stone-900">
                Aisha is at school.
              </p>
            </div>
            <div>
              <p className="text-micro font-medium uppercase text-stone-500">display · Inter Tight 600</p>
              <p className="mt-1 font-display text-display font-semibold text-stone-900">
                118 of 124 students
              </p>
            </div>
            <div>
              <p className="text-micro font-medium uppercase text-stone-500">heading · text-2xl · Inter 600</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-stone-900">
                Today's attendance
              </p>
            </div>
            <div>
              <p className="text-micro font-medium uppercase text-stone-500">subheading · text-lg · Inter 500</p>
              <p className="mt-1 text-lg font-medium text-stone-900">Main gate · Reader 02</p>
            </div>
            <div>
              <p className="text-micro font-medium uppercase text-stone-500">body · text-base · Inter 400</p>
              <p className="mt-1 text-base leading-relaxed text-stone-700">
                Tap-ins are recorded by the gate reader and synced within seconds. Parents see the
                same event their teacher sees, with no manual entry needed.
              </p>
            </div>
            <div>
              <p className="text-micro font-medium uppercase text-stone-500">small · text-sm · Inter 400</p>
              <p className="mt-1 text-sm text-stone-500">Refreshed 12 seconds ago</p>
            </div>
            <div>
              <p className="text-micro font-medium uppercase text-stone-500">numeric · JetBrains Mono 500</p>
              <p className="mt-1 font-mono text-2xl font-medium tabular-nums text-stone-900">
                07:42:18 · 3h 12m
              </p>
            </div>
          </div>
        </Section>

        {/* Radius + Elevation */}
        <Section
          title="Shape & elevation"
          subtitle="Five radii in active use; three elevation tiers tinted with stone."
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-200 shadow-elev-1">
              <p className="mb-4 text-sm font-medium text-stone-900">Radius scale</p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { cls: 'rounded-sm', label: 'sm · 8px' },
                  { cls: 'rounded-lg', label: 'lg · 8px' },
                  { cls: 'rounded-xl', label: 'xl · 12px' },
                  { cls: 'rounded-2xl', label: '2xl · 16px' },
                  { cls: 'rounded-3xl', label: '3xl · 24px' },
                  { cls: 'rounded-hero', label: 'hero · 28px' },
                ].map((r) => (
                  <div key={r.cls} className="space-y-1.5">
                    <div className={`h-14 bg-brand-100 ring-1 ring-brand-200 ${r.cls}`} />
                    <p className="text-xs text-stone-500">{r.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-200 shadow-elev-1">
              <p className="mb-4 text-sm font-medium text-stone-900">Elevation</p>
              <div className="space-y-4">
                {[
                  { cls: 'shadow-elev-1', label: 'elev-1 · resting card' },
                  { cls: 'shadow-elev-2', label: 'elev-2 · lifted / hover' },
                  { cls: 'shadow-elev-3', label: 'elev-3 · modal / sheet' },
                ].map((s) => (
                  <div
                    key={s.cls}
                    className={`flex items-center justify-between rounded-xl bg-white px-4 py-3 ${s.cls}`}
                  >
                    <span className="text-sm font-medium text-stone-900">{s.label}</span>
                    <span className="font-mono text-xs text-stone-500">{s.cls}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Section>

        {/* Buttons */}
        <Section title="Buttons" subtitle="Variants, sizes, and states.">
          <div className="space-y-5 rounded-2xl bg-white p-6 ring-1 ring-stone-200 shadow-elev-1">
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="primary">Continue</Button>
              <Button variant="secondary">Cancel</Button>
              <Button variant="ghost">Skip</Button>
              <Button variant="destructive">Delete student</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium · 44px</Button>
              <Button size="lg">Large · 48px</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button isLoading>Submitting</Button>
              <Button disabled>Disabled</Button>
              <Button variant="primary" rightIcon={<ArrowRight className="h-4 w-4" />}>
                View timeline
              </Button>
              <Button variant="secondary" leftIcon={<Check className="h-4 w-4" />}>
                Confirmed
              </Button>
            </div>
          </div>
        </Section>

        {/* Badges */}
        <Section title="Badges" subtitle="Status tones for attendance and system state.">
          <div className="space-y-4 rounded-2xl bg-white p-6 ring-1 ring-stone-200 shadow-elev-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="present">At school</Badge>
              <Badge tone="late">Late</Badge>
              <Badge tone="notyet">Not yet</Badge>
              <Badge tone="unverified">Unverified</Badge>
              <Badge tone="absent">Absent</Badge>
              <Badge tone="neutral">Neutral</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="present" size="md">
                At school · 7:42 AM
              </Badge>
              <Badge tone="late" size="md">
                Late by 12m
              </Badge>
              <Badge tone="absent" size="md">
                3 anomalies
              </Badge>
            </div>
          </div>
        </Section>

        {/* Inputs */}
        <Section title="Inputs" subtitle="Default, focused, error, disabled, with leading icon.">
          <div className="grid grid-cols-1 gap-4 rounded-2xl bg-white p-6 ring-1 ring-stone-200 shadow-elev-1 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-stone-700">Phone number</label>
              <Input className="mt-1" placeholder="+92 300 1234567" />
              <p className="mt-1 text-xs text-stone-500">We text a 4-digit code.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">OTP</label>
              <Input
                className="mt-1 text-center tracking-[0.5em]"
                placeholder="1234"
                defaultValue="4218"
                maxLength={4}
              />
              <p className="mt-1 text-xs text-stone-500">Auto-fills on supported devices.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">Error state</label>
              <Input className="mt-1" hasError placeholder="+92 300 1234567" defaultValue="0300" />
              <p className="mt-1 text-xs text-status-absent">Enter a valid phone number.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700">Disabled</label>
              <Input className="mt-1" disabled value="locked" readOnly />
              <p className="mt-1 text-xs text-stone-500">Field cannot be edited.</p>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-stone-700">Search (with icon)</label>
              <div className="relative mt-1">
                <Icon
                  icon={Search}
                  size="sm"
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"
                />
                <Input className="pl-9" placeholder="Search students by name or roll" />
              </div>
            </div>
          </div>
        </Section>

        {/* Avatars / Switches / Spinners */}
        <Section title="Avatar, switch, spinner">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-200 shadow-elev-1">
              <p className="mb-4 text-sm font-medium text-stone-900">Avatar</p>
              <div className="flex items-end gap-3">
                <Avatar name="Aisha Khan" size="xs" />
                <Avatar name="Aisha Khan" size="sm" />
                <Avatar name="Aisha Khan" size="md" />
                <Avatar name="Aisha Khan" size="lg" />
              </div>
            </div>
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-200 shadow-elev-1">
              <p className="mb-4 text-sm font-medium text-stone-900">Switch</p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-700">Push notifications</span>
                  <Switch checked={switchA} onChange={setSwitchA} ariaLabel="Push notifications" />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-stone-700">SMS fallback</span>
                  <Switch checked={switchB} onChange={setSwitchB} ariaLabel="SMS fallback" />
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-6 ring-1 ring-stone-200 shadow-elev-1">
              <p className="mb-4 text-sm font-medium text-stone-900">Spinner</p>
              <div className="flex items-center gap-6 text-brand-600">
                <Spinner size="sm" />
                <Spinner size="md" />
                <Spinner size="lg" />
              </div>
            </div>
          </div>
        </Section>

        {/* Sample patterns — proves the system composes */}
        <Section
          title="Patterns"
          subtitle="Real compositions using only slice-1 tokens. These are reference, not final screens."
        >
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {/* Status hero — parent moment */}
            <article className="overflow-hidden rounded-hero bg-white shadow-elev-2 ring-1 ring-stone-200">
              <div className="h-1 w-full bg-status-present" aria-hidden="true" />
              <div className="p-7">
                <div className="flex items-center gap-3">
                  <Avatar name="Aisha Khan" size="md" />
                  <div>
                    <p className="text-micro font-medium uppercase text-stone-500">Roll 4-A · Grade 4</p>
                    <p className="text-base font-semibold text-stone-900">Aisha Khan</p>
                  </div>
                </div>
                <div className="mt-6 flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-2 h-3 w-3 flex-shrink-0 rounded-full bg-status-present"
                  />
                  <div>
                    <h3 className="font-display text-display font-semibold text-status-present">
                      At school
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-stone-600">
                      Tapped in at <span className="font-mono tabular-nums">7:42 AM</span> · 3h 12m
                      on campus.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="mt-6 inline-flex w-full items-center justify-between rounded-lg bg-stone-50 px-4 py-3 text-sm font-medium text-stone-700 ring-1 ring-inset ring-stone-200 transition-colors hover:bg-stone-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                >
                  <span>View today's timeline</span>
                  <Icon icon={ChevronRight} size="sm" />
                </button>
              </div>
            </article>

            {/* Stat card — admin moment */}
            <article className="rounded-2xl bg-white p-6 shadow-elev-1 ring-1 ring-stone-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-micro font-medium uppercase text-stone-500">Friday · 16 May</p>
                  <h3 className="mt-1 font-display text-2xl font-semibold tracking-tight text-stone-900">
                    All clear
                  </h3>
                  <p className="mt-0.5 text-sm text-stone-600">3 late · all devices online</p>
                </div>
                <Badge tone="present" size="md">
                  ●&nbsp;live
                </Badge>
              </div>
              <div className="mt-6 grid grid-cols-4 gap-3">
                {[
                  { label: 'Present', value: '118', tone: 'present' as const },
                  { label: 'Late', value: '3', tone: 'late' as const },
                  { label: 'Not yet', value: '3', tone: 'notyet' as const },
                  { label: 'Anomalies', value: '0', tone: 'neutral' as const },
                ].map((s) => (
                  <div
                    key={s.label}
                    className="rounded-xl bg-stone-50 p-3 ring-1 ring-inset ring-stone-200"
                  >
                    <p className="text-micro font-medium uppercase text-stone-500">{s.label}</p>
                    <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-stone-900">
                      {s.value}
                    </p>
                  </div>
                ))}
              </div>
            </article>

            {/* Tap row sample */}
            <article className="rounded-2xl bg-white p-6 shadow-elev-1 ring-1 ring-stone-200">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-stone-900">Live taps</h3>
                <span className="text-xs text-stone-500">just now</span>
              </div>
              <ul className="mt-3 divide-y divide-stone-100">
                {[
                  { name: 'Ahmed Khan', sub: 'In · Main gate', time: '7:42 AM', dir: 'in' as const },
                  { name: 'Hira Mahmood', sub: 'In · Main gate', time: '7:41 AM', dir: 'in' as const },
                  { name: 'Rida Faisal', sub: 'Out · Side gate', time: '2:14 PM', dir: 'out' as const },
                ].map((e) => (
                  <li
                    key={e.name}
                    className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex h-8 w-8 items-center justify-center rounded-full ${
                        e.dir === 'in'
                          ? 'bg-status-present/10 text-status-present'
                          : 'bg-status-notyet/15 text-status-notyet'
                      }`}
                    >
                      {e.dir === 'in' ? <LogIn className="h-4 w-4" /> : <LogOut className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-stone-900">{e.name}</p>
                      <p className="truncate text-xs text-stone-500">{e.sub}</p>
                    </div>
                    <span className="flex-shrink-0 font-mono text-xs tabular-nums text-stone-500">
                      {e.time}
                    </span>
                  </li>
                ))}
              </ul>
            </article>

            {/* Empty + error alerts */}
            <div className="space-y-3">
              <div className="rounded-2xl bg-status-absent/10 p-5 text-sm text-status-absent ring-1 ring-status-absent/20">
                <p className="font-medium">We couldn't load today's attendance.</p>
                <Button variant="secondary" size="sm" className="mt-3">
                  Retry
                </Button>
              </div>
              <div className="rounded-2xl bg-white p-8 text-center text-sm text-stone-500 ring-1 ring-stone-200">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-stone-100 text-stone-400">
                  <Search className="h-5 w-5" />
                </div>
                <p className="mt-3 font-medium text-stone-700">No students found</p>
                <p className="mt-1">Try a different roll number or first name.</p>
              </div>
              <div className="rounded-2xl bg-accent-50 p-5 text-sm text-accent-700 ring-1 ring-accent-100">
                <p className="font-medium">3 anomalies need review.</p>
                <p className="mt-0.5 text-accent-700/80">
                  Devices flagged unusual sequences in the last hour.
                </p>
              </div>
            </div>
          </div>
        </Section>

        <footer className="border-t border-stone-200 pt-6 pb-4 text-xs text-stone-500">
          Slice 1 — tokens + atoms. Routes auto-stripped from production builds.
        </footer>
      </div>
    </main>
  )
}
