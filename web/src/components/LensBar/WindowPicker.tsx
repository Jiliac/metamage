'use client'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  asIsoDate,
  expandPreset,
  isValidIsoDate,
  PRESETS,
  PRESET_LABELS,
} from '@/lib/params'
import { cn } from '@/lib/utils'
import { useMetaParams } from '@/hooks/useMetaParams'

import { knobClass } from './styles'

// ---------------------------------------------------------------------------
// WindowPicker — the "Window Jun 1 → Jun 30" knob (§9 spike). Opens a popover
// with preset chips (expanded to explicit start/end at the input edge, never
// stored) plus raw start/end date inputs. The canonical time representation is
// the explicit inclusive `start`/`end` pair (blueprint §2).
// ---------------------------------------------------------------------------

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function formatDay(iso: string): string {
  const parts = iso.split('-')
  const m = Number(parts[1])
  const d = Number(parts[2])
  if (!MONTHS[m - 1] || Number.isNaN(d)) return iso
  return `${MONTHS[m - 1]} ${d}`
}

function windowLabel(start: string, end: string): string {
  return `${formatDay(start)} → ${formatDay(end)}`
}

const dateInputClass =
  'border border-line bg-bg text-ink px-2 py-1 text-[13px] font-mono w-full ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold'

export function WindowPicker() {
  const { query, setParams } = useMetaParams()

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={knobClass}>
          Window{' '}
          <b className="font-semibold text-ink">
            {windowLabel(query.start, query.end)}
          </b>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 border-line bg-surface text-ink"
      >
        <div className="grid gap-3">
          <div>
            <p className="eyebrow mb-2">Presets</p>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map(p => (
                <button
                  key={p}
                  type="button"
                  className={cn(knobClass, 'px-2.5 py-1 text-[12px]')}
                  onClick={() => {
                    const w = expandPreset(p)
                    setParams({ start: w.start, end: w.end })
                  }}
                >
                  {PRESET_LABELS[p]}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="grid gap-1 text-[11px] uppercase tracking-wider text-ink-3">
              Start
              <input
                type="date"
                value={query.start}
                max={query.end}
                onChange={e => {
                  const v = e.target.value
                  if (isValidIsoDate(v)) setParams({ start: asIsoDate(v) })
                }}
                className={dateInputClass}
              />
            </label>
            <label className="grid gap-1 text-[11px] uppercase tracking-wider text-ink-3">
              End
              <input
                type="date"
                value={query.end}
                min={query.start}
                onChange={e => {
                  const v = e.target.value
                  if (isValidIsoDate(v)) setParams({ end: asIsoDate(v) })
                }}
                className={dateInputClass}
              />
            </label>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default WindowPicker
