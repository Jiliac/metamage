import { ImageResponse } from 'next/og'
import { getDataSource } from '@/datasource'
import type { ArchetypeRowDTO, FormatDTO } from '@/datasource/types'
import { asArchetypeSlug, parseMatrixTopN, parseMetaQuery } from '@/lib/params'
import { toManaColors, type ManaColor } from '@/components/ManaPips'

// ---------------------------------------------------------------------------
// OpenGraph card route (blueprint §2 + §9). A dedicated route handler is used
// over the file-based `opengraph-image` convention BECAUSE that convention only
// receives path params, never `searchParams` — and the window/knobs that define
// the shared view live in the query string. This handler reads the full lens.
//
// Runtime: `nodejs`. The fixture backend (WP1 `FixtureDataSource`) reads
// committed JSON off disk; the Node runtime guarantees that access. It also
// keeps us honest about "NO remote fetches" — every colour and glyph below is a
// literal/local value; nothing is fetched. Satori cannot resolve CSS custom
// properties or Tailwind classes, so the Gathering Ledger palette is inlined as
// hex, and an editorial serif stack is requested for the title (Satori falls
// back to its bundled sans when no serif is embedded — the documented fallback).
// ---------------------------------------------------------------------------

export const runtime = 'nodejs'

const SIZE = { width: 1200, height: 630 } as const

// Arena Bronze — dark tokens (§9), inlined because Satori has no CSS vars.
const C = {
  bg: '#16130e',
  surface: '#1e1a13',
  raised: '#282216',
  line: '#37301e',
  lineStrong: '#4d422a',
  ink: '#eae3ce',
  ink2: '#a99f85',
  ink3: '#726a55',
  gold: '#c9a855',
  goldSoft: '#98803f',
  good: '#2e9e8f',
  bad: '#d45a7e',
} as const

// Printed-cardboard mana chips — theme-constant (§9).
const CHIP: Record<ManaColor, string> = {
  W: '#f5f0ce',
  U: '#abd8ee',
  B: '#ccc5c0',
  R: '#f4a78d',
  G: '#9bd3ae',
}
const CHIP_INK = '#141010'

const WUBRG =
  'linear-gradient(90deg, rgba(0,0,0,0) 0%, #f5f0ce 10%, #abd8ee 32%, #ccc5c0 50%, #f4a78d 68%, #9bd3ae 90%, rgba(0,0,0,0) 100%)'

const SERIF = 'Georgia, "Times New Roman", ui-serif, serif'
const MONO = 'ui-monospace, "SF Mono", Menlo, monospace'

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] // prettier-ignore

const fmtInt = (n: number): string => n.toLocaleString('en-US')
const fmtPct = (x: number, d = 1): string => `${(x * 100).toFixed(d)}%`

function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${MONTHS[(m ?? 1) - 1]} ${d}`
}

function windowLabel(start: string, end: string): string {
  return `${dayLabel(start)} – ${dayLabel(end)}, ${end.slice(0, 4)}`
}

function wrColor(wr: number): string {
  if (wr > 0.5) return C.good
  if (wr < 0.5) return C.bad
  return C.ink
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// ---- small view primitives (all containers carry display:flex for Satori) --

function Pips({ colors, size }: { colors: string | null; size: number }) {
  const cs = toManaColors(colors)
  if (cs.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {cs.map((c, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: size,
            height: size,
            borderRadius: size,
            background: CHIP[c],
            color: CHIP_INK,
            fontSize: Math.round(size * 0.56),
            fontWeight: 800,
          }}
        >
          {c}
        </div>
      ))}
    </div>
  )
}

type Tile = { v: string; l: string }

function KpiStrip({ tiles }: { tiles: Tile[] }) {
  return (
    <div style={{ display: 'flex', marginTop: 30 }}>
      {tiles.map((t, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            paddingRight: 40,
            marginRight: 40,
            borderRight: i < tiles.length - 1 ? `1px solid ${C.line}` : 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              fontFamily: MONO,
              fontSize: 46,
              fontWeight: 600,
              color: C.ink,
              lineHeight: 1,
            }}
          >
            {t.v}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 10,
              fontSize: 18,
              letterSpacing: 3,
              textTransform: 'uppercase',
              color: C.ink3,
            }}
          >
            {t.l}
          </div>
        </div>
      ))}
    </div>
  )
}

function LeaderRow({ row }: { row: ArchetypeRowDTO }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '12px 0',
        borderTop: `1px solid ${C.line}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          borderRadius: 30,
          background: C.raised,
          color: C.gold,
          fontFamily: MONO,
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        {row.presenceRank}
      </div>
      <Pips colors={row.color} size={22} />
      <div style={{ display: 'flex', fontSize: 26, color: C.ink }}>
        {row.name}
      </div>
      <div style={{ display: 'flex', flex: 1 }} />
      <div
        style={{
          display: 'flex',
          fontFamily: MONO,
          fontSize: 22,
          color: C.ink2,
        }}
      >
        {fmtPct(row.share)}
      </div>
      <div
        style={{
          display: 'flex',
          fontFamily: MONO,
          fontSize: 22,
          fontWeight: 700,
          width: 90,
          justifyContent: 'flex-end',
          color: wrColor(row.wr),
        }}
      >
        {fmtPct(row.wr)}
      </div>
    </div>
  )
}

// ---- card frame ------------------------------------------------------------

function Card(props: {
  formatName: string
  windowText: string
  heroTitle: string
  heroThin?: string
  colors?: string | null
  tiles: Tile[]
  leaders: ArchetypeRowDTO[]
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: C.bg,
        color: C.ink,
        fontFamily: 'Avenir, "Segoe UI", system-ui, sans-serif',
      }}
    >
      <div style={{ display: 'flex', height: 6, background: WUBRG }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          padding: '56px 64px 48px',
        }}
      >
        {/* eyebrow */}
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            letterSpacing: 5,
            textTransform: 'uppercase',
            color: C.gold,
            fontWeight: 600,
          }}
        >
          {`The Ledger · ${props.formatName} · ${props.windowText}`}
        </div>

        {/* hero */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginTop: 18,
          }}
        >
          {props.colors ? <Pips colors={props.colors} size={38} /> : null}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              fontFamily: SERIF,
              fontSize: 68,
              fontWeight: 700,
              lineHeight: 1.04,
              color: C.ink,
            }}
          >
            {props.heroTitle}
          </div>
        </div>
        {props.heroThin ? (
          <div
            style={{
              display: 'flex',
              marginTop: 10,
              fontFamily: SERIF,
              fontSize: 30,
              color: C.ink2,
            }}
          >
            {props.heroThin}
          </div>
        ) : null}

        <KpiStrip tiles={props.tiles} />

        {/* leaders */}
        <div
          style={{ display: 'flex', flexDirection: 'column', marginTop: 26 }}
        >
          {props.leaders.map(r => (
            <LeaderRow key={r.slug} row={r} />
          ))}
        </div>

        <div style={{ display: 'flex', flex: 1 }} />

        {/* footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderTop: `1px solid ${C.line}`,
            paddingTop: 22,
          }}
        >
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700 }}>
            <span style={{ color: C.ink }}>Meta</span>
            <span style={{ color: C.gold }}>Mage</span>
          </div>
          <div style={{ display: 'flex', flex: 1 }} />
          <div
            style={{
              display: 'flex',
              fontFamily: MONO,
              fontSize: 18,
              color: C.ink3,
            }}
          >
            Tournament matchup data, on your terms
          </div>
        </div>
      </div>
    </div>
  )
}

function FallbackCard() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: C.bg,
        color: C.ink,
      }}
    >
      <div style={{ display: 'flex', height: 6, background: WUBRG }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
          padding: '0 64px',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            letterSpacing: 5,
            textTransform: 'uppercase',
            color: C.gold,
            fontWeight: 600,
          }}
        >
          The Gathering Ledger
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 16,
            fontFamily: SERIF,
            fontSize: 72,
            fontWeight: 700,
          }}
        >
          <span style={{ color: C.ink }}>Meta</span>
          <span style={{ color: C.gold }}>Mage</span>
        </div>
        <div
          style={{
            display: 'flex',
            marginTop: 14,
            fontSize: 30,
            color: C.ink2,
          }}
        >
          Magic: The Gathering tournament metagame explorer
        </div>
      </div>
    </div>
  )
}

export async function GET(req: Request): Promise<ImageResponse> {
  try {
    const { searchParams } = new URL(req.url)
    // Normalize the slug (casing variants arrive from hand-typed share URLs);
    // an unknown format falls through to the generic fallback card via catch.
    const format = (searchParams.get('format') ?? 'standard')
      .trim()
      .toLowerCase()
    const view = searchParams.get('view') ?? 'meta'
    const q = parseMetaQuery(format, searchParams)
    const ds = getDataSource()

    // Display name for the format (falls back to a title-cased slug).
    let formatName = titleCase(format)
    try {
      const formats = await ds.listFormats()
      const hit = formats.find((f: FormatDTO) => f.slug === q.format)
      if (hit) formatName = hit.name
    } catch {
      // keep the title-cased fallback
    }

    const report = await ds.getMetaReport(q)
    const windowText = windowLabel(report.window.start, report.window.end)
    const kpiTiles: Tile[] = [
      { v: fmtInt(report.kpis.tournaments), l: 'Tournaments' },
      { v: fmtInt(report.kpis.entries), l: 'Decks' },
      { v: fmtInt(report.kpis.matches), l: 'Matches' },
    ]

    if (view === 'archetype') {
      const slug = searchParams.get('slug')
      let arch: ArchetypeRowDTO | null =
        report.rows.find((r: ArchetypeRowDTO) => r.slug === slug) ?? null
      if (!arch && slug) {
        const detail = await ds.getArchetypeDetail({
          ...q,
          slug: asArchetypeSlug(slug),
        })
        arch = detail?.summary ?? null
      }
      if (arch) {
        const rec =
          arch.draws > 0
            ? `${arch.wins}–${arch.losses}–${arch.draws}`
            : `${arch.wins}–${arch.losses}`
        return new ImageResponse(
          <Card
            formatName={formatName}
            windowText={windowText}
            heroTitle={arch.name}
            heroThin={`Win rate ${fmtPct(arch.wr)} · ${fmtPct(
              arch.share
            )} of the metagame`}
            colors={arch.color}
            tiles={[
              { v: fmtPct(arch.wr), l: 'Win rate' },
              { v: rec, l: 'Record' },
              { v: fmtPct(arch.share), l: 'Share' },
              { v: fmtInt(arch.matches), l: 'Matches' },
            ]}
            leaders={[]}
          />,
          SIZE
        )
      }
    }

    if (view === 'matrix') {
      const n = parseMatrixTopN(searchParams)
      const leaders = report.rows
        .filter((r: ArchetypeRowDTO) => !r.isBucket)
        .slice(0, 3)
      return new ImageResponse(
        <Card
          formatName={formatName}
          windowText={windowText}
          heroTitle="Matchup Matrix"
          heroThin={`Row-vs-column win rates across the top ${n} archetypes`}
          tiles={kpiTiles}
          leaders={leaders}
        />,
        SIZE
      )
    }

    // default: meta overview
    const leaders = report.rows
      .filter((r: ArchetypeRowDTO) => !r.isBucket)
      .slice(0, 3)
    const top = leaders[0]
    return new ImageResponse(
      <Card
        formatName={formatName}
        windowText={windowText}
        heroTitle={top ? top.name : `${formatName} Metagame`}
        heroThin={
          top
            ? `Holds the room at ${fmtPct(top.share)} of matches · ${fmtPct(
                top.wr
              )} win rate`
            : 'The field, ranked'
        }
        colors={top?.color ?? null}
        tiles={kpiTiles}
        leaders={leaders}
      />,
      SIZE
    )
  } catch {
    return new ImageResponse(<FallbackCard />, SIZE)
  }
}
