'use client'

import * as React from 'react'

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useMetaParams } from '@/hooks/useMetaParams'

import { knobClass, chipActiveClass } from './styles'

// ---------------------------------------------------------------------------
// KnobsPopover — the analytic knobs (§6): topN, minMatches, presence weight, and
// the unknown/conflict bucket visibility. On the matrix route it also exposes the
// matrix size (?n). Numeric fields commit on blur / Enter (not per keystroke) so
// the URL isn't rewritten on every digit; toggles commit instantly. Clamps match
// the params.ts contract (blueprint §2).
// ---------------------------------------------------------------------------

const clampInt = (n: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(n)))

type NumberFieldProps = {
  label: string
  value: number
  min: number
  max: number
  onCommit: (v: number) => void
}

function NumberField({ label, value, min, max, onCommit }: NumberFieldProps) {
  const [text, setText] = React.useState(String(value))
  React.useEffect(() => {
    setText(String(value))
  }, [value])

  const commit = () => {
    const n = Number.parseInt(text, 10)
    if (Number.isFinite(n)) {
      const clamped = clampInt(n, min, max)
      setText(String(clamped))
      if (clamped !== value) onCommit(clamped)
    } else {
      setText(String(value))
    }
  }

  return (
    <label className="grid gap-1 text-[11px] uppercase tracking-wider text-ink-3">
      {label}
      <input
        type="number"
        min={min}
        max={max}
        value={text}
        onChange={e => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commit()
          }
        }}
        className="w-full border border-line bg-bg px-2 py-1 font-mono text-[13px] text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-gold"
      />
    </label>
  )
}

type ToggleRowProps<T extends string> = {
  legend: string
  options: readonly { value: T; label: string }[]
  current: T
  onSelect: (v: T) => void
}

function ToggleRow<T extends string>({
  legend,
  options,
  current,
  onSelect,
}: ToggleRowProps<T>) {
  return (
    <div className="grid gap-1">
      <p className="text-[11px] uppercase tracking-wider text-ink-3">
        {legend}
      </p>
      <div className="flex gap-1">
        {options.map(o => {
          const active = o.value === current
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(o.value)}
              className={cn(
                knobClass,
                'flex-1 justify-center',
                active && chipActiveClass
              )}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export type KnobsPopoverProps = {
  variant?: 'meta' | 'matrix'
}

export function KnobsPopover({ variant = 'meta' }: KnobsPopoverProps) {
  const { query, matrixTopN, setParams } = useMetaParams()
  const summary = `Top ${query.topN} · min ${query.minMatches}`

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={knobClass}>
          {summary}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 border-line bg-surface text-ink"
      >
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Top archetypes"
              value={query.topN}
              min={1}
              max={100}
              onCommit={v => setParams({ topN: v })}
            />
            <NumberField
              label="Min matches"
              value={query.minMatches}
              min={0}
              max={100000}
              onCommit={v => setParams({ minMatches: v })}
            />
          </div>

          {variant === 'matrix' && (
            <NumberField
              label="Matrix size"
              value={matrixTopN}
              min={2}
              max={30}
              onCommit={v => setParams({ matrixTopN: v })}
            />
          )}

          <ToggleRow
            legend="Presence weight"
            options={[
              { value: 'match', label: 'Match' },
              { value: 'entry', label: 'Entry' },
            ]}
            current={query.weight}
            onSelect={v => setParams({ weight: v })}
          />

          <ToggleRow
            legend="Unknown / conflict buckets"
            options={[
              { value: 'hide', label: 'Hide' },
              { value: 'show', label: 'Show' },
            ]}
            current={query.hideBuckets ? 'hide' : 'show'}
            onSelect={v => setParams({ hideBuckets: v === 'hide' })}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default KnobsPopover
