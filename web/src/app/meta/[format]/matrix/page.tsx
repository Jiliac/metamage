import type { Metadata } from 'next'
import { Suspense } from 'react'

import { getDataSource } from '@/datasource'
import type { ArchetypeRef, FormatDTO, MatrixDTO } from '@/datasource/types'
import { buildHref, parseMetaQuery, parseMatrixTopN } from '@/lib/params'
import { buildPageMetadata } from '@/lib/seo'

import { LensBar } from '@/components/LensBar/LensBar'
import { EmptyState } from '@/components/EmptyState'
import { MatchupMatrix } from '@/components/charts/MatchupMatrix'

// ---------------------------------------------------------------------------
// Matchup matrix route (WP5) — the moat, full N×N grid. RSC. Extra params
// `n` (matrixTopN) and `min` (minMatches) flow through the LensBar's matrix
// knobs. The grid sits inside the notched gold frame treatment (§9 rule 4).
// ---------------------------------------------------------------------------

type RouteParams = { format: string }
type SearchParams = Record<string, string | string[] | undefined>

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function formatName(formats: FormatDTO[], slug: string): string {
  return formats.find(f => f.slug === slug)?.name ?? titleCase(slug)
}

// SSG default-window matrix per format; other windows/knobs on demand + cached
// (blueprint §2 route table).
export const revalidate = 3600
export const dynamicParams = true

export async function generateStaticParams(): Promise<RouteParams[]> {
  const formats = await getDataSource().listFormats()
  return formats.map(f => ({ format: String(f.slug) }))
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}): Promise<Metadata> {
  const { format } = await params
  const sp = await searchParams
  const query = parseMetaQuery(format, sp)
  const matrixTopN = parseMatrixTopN(sp)
  const formats = await getDataSource().listFormats()
  const name = formatName(formats, format)
  return buildPageMetadata({
    view: 'matrix',
    format,
    query,
    matrixTopN,
    title: `${name} Matchup Matrix`,
    description: `The full ${name} matchup matrix — row-beats-column win rates with confidence, clustered by player.`,
  })
}

export default async function MatrixPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>
  searchParams: Promise<SearchParams>
}) {
  const { format } = await params
  const sp = await searchParams

  const query = parseMetaQuery(format, sp)
  const matrixTopN = parseMatrixTopN(sp)

  const ds = getDataSource()
  const [formats, matrix, archetypes]: [
    FormatDTO[],
    MatrixDTO,
    ArchetypeRef[],
  ] = await Promise.all([
    ds.listFormats(),
    ds.getMatchupMatrix({ ...query, matrixTopN }),
    ds.searchArchetypes(query.format, ''),
  ])
  const fmtName = formatName(formats, format)

  return (
    <>
      <Suspense fallback={null}>
        <LensBar formats={formats} archetypes={archetypes} variant="matrix" />
      </Suspense>

      <section className="mt-10">
        <p className="eyebrow mb-1.5">The moat</p>
        <h2 className="font-display text-[clamp(24px,4vw,34px)] font-bold">
          {fmtName} matchup matrix
        </h2>
        <p className="mt-0.5 max-w-[65ch] text-[13.5px] text-ink-2">
          Row beats column. Ink density is confidence — pale cells are small
          samples; a dash means fewer than five matches. Nobody else publishes
          this.
        </p>

        {matrix.order.length === 0 ? (
          <EmptyState
            title="Not enough matchup data"
            message={`There aren't enough recorded matches in this window to build a ${fmtName} matrix. Widen the window or lower the minimum-matches floor.`}
          />
        ) : (
          <div
            className="clip-notch-lg mt-4 p-px"
            style={{
              background:
                'linear-gradient(160deg, var(--gold-soft), var(--line-strong) 40%, var(--gold-soft))',
            }}
          >
            <div className="clip-notch-lg bg-surface p-5">
              <MatchupMatrix
                data={matrix}
                rowHref={Object.fromEntries(
                  matrix.order.map(o => [
                    String(o.slug),
                    buildHref(query.format, query, {
                      path: `/archetype/${o.slug}`,
                    }),
                  ])
                )}
              />
            </div>
          </div>
        )}
      </section>

      <footer className="mt-[72px] flex flex-wrap items-center gap-[18px] border-t border-line pt-[18px] text-[12.5px] text-ink-3">
        <span>
          Source: MTGO Top32 &amp; Melee · {query.start} → {query.end}
        </span>
        <span>Card art © Wizards of the Coast, via Scryfall</span>
      </footer>
    </>
  )
}
