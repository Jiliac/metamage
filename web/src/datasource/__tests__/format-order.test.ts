import { describe, expect, it } from 'vitest'

import { FORMAT_ORDER, sortFormats } from '@/datasource/format-order'

describe('sortFormats', () => {
  it('orders known formats by FORMAT_ORDER regardless of input order', () => {
    const input = [...FORMAT_ORDER].reverse().map(slug => ({ slug }))
    expect(sortFormats(input).map(f => f.slug)).toEqual([...FORMAT_ORDER])
  })

  it('puts unknown formats last, alphabetically, without mutating input', () => {
    const input = [{ slug: 'zeta' }, { slug: 'legacy' }, { slug: 'alpha' }]
    const out = sortFormats(input)
    expect(out.map(f => f.slug)).toEqual(['legacy', 'alpha', 'zeta'])
    expect(input.map(f => f.slug)).toEqual(['zeta', 'legacy', 'alpha'])
  })
})
