import { ImageResponse } from 'next/og'
import { getDataSource } from '@/datasource'
import { parseMetaQuery, parseMatrixTopN, asArchetypeSlug } from '@/lib/params'
import type { OgView } from '@/lib/seo'
import type {
  ArchetypeRowDTO,
  FormatDTO,
  MatrixOrderEntryDTO,
} from '@/datasource/types'

// ---------------------------------------------------------------------------
// Deep-linked OG card renderer. A route handler (not the file-based
// `opengraph-image` convention) so it can read the FULL lens from searchParams
// — the window + knobs that define the shared state (blueprint §2, risk §8.6).
//
// Runtime = nodejs (NOT edge): the card pulls live numbers through
// `getDataSource()`, whose fixture backend reads committed JSON off disk and
// later becomes a Postgres client — neither is edge-safe. Everything is drawn
// with next/og div primitives; no Recharts, no remote Scryfall art, no external
// fetch, so it stays strict-CSP-safe. Any failure falls back to a brand card.
// ---------------------------------------------------------------------------
export const runtime = 'nodejs'

const SIZE = { width: 1200, height: 630 }

// Fixed dark palette — OG cards render one theme (mirrors globals.css `.dark`).
const C = {
  bg: '#0a0a0a',
  panel: '#161616',
  border: '#2a2a2a',
  fg: '#fafafa',
  muted: '#a1a1aa',
  faint: '#71717a',
  accent: '#4ade80', // --chart-good (dark)
  reference: '#60a5fa', // --chart-reference (dark)
  bad: '#f87171', // --chart-bad (dark)
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] // prettier-ignore

/** 'YYYY-MM-DD' → 'Jun 1, 2026' with no locale/timezone dependence. */
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${MONTHS[m - 1]} ${d}, ${y}`
}

/** Inclusive window → 'Jun 1 – Jun 30, 2026' (drops repeated year). */
function fmtWindow(start: string, end: string): string {
  const a = fmtDate(start)
  const b = fmtDate(end)
  const ay = a.slice(-4)
  const by = b.slice(-4)
  if (ay === by) return `${a.slice(0, -6)} – ${b}`
  return `${a} – ${b}`
}

/** 'duel-commander' → 'Duel Commander' (fallback when name lookup fails). */
function titleize(slug: string): string {
  return slug
    .split('-')
    .map(w => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

function num(n: number): string {
  return Math.round(n).toLocaleString('en-US')
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}

const VIEW_LABEL: Record<OgView, string> = {
  meta: 'METAGAME',
  archetype: 'ARCHETYPE',
  matrix: 'MATCHUP MATRIX',
}

function isView(v: string | null): v is OgView {
  return v === 'meta' || v === 'archetype' || v === 'matrix'
}

// ---- Primitives ------------------------------------------------------------

function Shell({
  view,
  children,
}: {
  view: OgView
  children: React.ReactNode
}) {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: C.bg,
        color: C.fg,
        padding: 64,
        fontFamily: 'sans-serif',
      }}
    >
      {/* Brand header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 40,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 14,
              backgroundColor: C.accent,
              color: C.bg,
              fontSize: 38,
              fontWeight: 800,
            }}
          >
            M
          </div>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 700 }}>
            MetaMage
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            padding: '10px 20px',
            borderRadius: 999,
            border: `1px solid ${C.border}`,
            backgroundColor: C.panel,
            color: C.muted,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: 2,
          }}
        >
          {VIEW_LABEL[view]}
        </div>
      </div>
      {children}
    </div>
  )
}

function Title({ text }: { text: string }) {
  return (
    <div
      style={{
        display: 'flex',
        fontSize: 76,
        fontWeight: 800,
        lineHeight: 1.05,
        marginBottom: 12,
      }}
    >
      {text}
    </div>
  )
}

function Subtitle({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', fontSize: 30, color: C.muted }}>{text}</div>
  )
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        padding: '22px 26px',
        borderRadius: 16,
        border: `1px solid ${C.border}`,
        backgroundColor: C.panel,
      }}
    >
      <div style={{ display: 'flex', fontSize: 48, fontWeight: 800 }}>
        {value}
      </div>
      <div
        style={{
          display: 'flex',
          fontSize: 22,
          color: C.faint,
          letterSpacing: 1,
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  )
}

function ListRow({
  rank,
  name,
  left,
  right,
  rightColor,
}: {
  rank: number
  name: string
  left: string
  right: string
  rightColor?: string
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 4px',
        borderBottom: `1px solid ${C.border}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: 999,
            backgroundColor: C.panel,
            border: `1px solid ${C.border}`,
            color: C.muted,
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {rank}
        </div>
        <div style={{ display: 'flex', fontSize: 30, fontWeight: 600 }}>
          {name}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <div style={{ display: 'flex', fontSize: 26, color: C.muted }}>
          {left}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            fontWeight: 700,
            width: 120,
            justifyContent: 'flex-end',
            color: rightColor ?? C.fg,
          }}
        >
          {right}
        </div>
      </div>
    </div>
  )
}

function Spacer() {
  return <div style={{ display: 'flex', flex: 1 }} />
}

// ---- Card builders (data already resolved; pure render) --------------------

function FallbackCard({
  view,
  title,
  subtitle,
}: {
  view: OgView
  title: string
  subtitle: string
}) {
  return (
    <Shell view={view}>
      <Spacer />
      <Title text={title} />
      <Subtitle text={subtitle} />
      <Spacer />
    </Shell>
  )
}

// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams
  const rawView = sp.get('view')
  const view: OgView = isView(rawView) ? rawView : 'meta'
  const format = sp.get('format') ?? 'pauper'

  // Parse the lens the same way pages do, so the card matches the page exactly.
  const query = parseMetaQuery(format, sp)
  const windowText = fmtWindow(query.start, query.end)

  try {
    const ds = getDataSource()

    // Resolve a friendly format name (falls back to a titleized slug).
    let formatName = titleize(format)
    try {
      const formats = await ds.listFormats()
      const hit = formats.find((f: FormatDTO) => String(f.slug) === format)
      if (hit) formatName = hit.name
    } catch {
      // keep titleized fallback
    }

    if (view === 'archetype') {
      const rawSlug = sp.get('slug')
      if (!rawSlug) {
        return new ImageResponse(
          <FallbackCard
            view="archetype"
            title={`${formatName} archetype`}
            subtitle={windowText}
          />,
          SIZE
        )
      }
      const slug = asArchetypeSlug(rawSlug)
      const detail = await ds.getArchetypeDetail({ ...query, slug })
      if (!detail) {
        return new ImageResponse(
          <FallbackCard
            view="archetype"
            title={titleize(rawSlug)}
            subtitle={`${formatName} · ${windowText}`}
          />,
          SIZE
        )
      }
      const s = detail.summary
      const tierText = s.tier === null ? '—' : `Tier ${s.tier}`
      return new ImageResponse(
        <Shell view="archetype">
          <Title text={detail.archetype.name} />
          <Subtitle text={`${formatName} · ${windowText}`} />
          <div style={{ display: 'flex', gap: 20, marginTop: 40 }}>
            <Kpi label="WIN RATE" value={pct(s.wr)} />
            <Kpi label="META SHARE" value={pct(s.share)} />
            <Kpi label="TIER" value={tierText} />
            <Kpi
              label="RECORD (W–L–D)"
              value={`${s.wins}–${s.losses}–${s.draws}`}
            />
          </div>
          <Spacer />
          <div style={{ display: 'flex', fontSize: 24, color: C.faint }}>
            {`95% CI ${pct(s.wrLo)} – ${pct(s.wrHi)} · ${num(s.players)} players · ${num(s.games)} games`}
          </div>
        </Shell>,
        SIZE
      )
    }

    if (view === 'matrix') {
      const matrixTopN = parseMatrixTopN(sp)
      const matrix = await ds.getMatchupMatrix({ ...query, matrixTopN })
      const top = matrix.order.slice(0, 5)
      return new ImageResponse(
        <Shell view="matrix">
          <Title text={`${formatName} Matchup Matrix`} />
          <Subtitle
            text={`${matrix.order.length} archetypes · ${windowText}`}
          />
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              marginTop: 28,
            }}
          >
            {top.map((e: MatrixOrderEntryDTO, i: number) => (
              <ListRow
                key={String(e.slug)}
                rank={i + 1}
                name={e.name}
                left={`${pct(e.share)} share`}
                right={e.globalWr === null ? '—' : pct(e.globalWr)}
                rightColor={
                  e.globalWr === null
                    ? C.muted
                    : e.globalWr >= 0.5
                      ? C.accent
                      : C.bad
                }
              />
            ))}
          </div>
          <Spacer />
          <div style={{ display: 'flex', fontSize: 24, color: C.faint }}>
            Head-to-head win rates across the field
          </div>
        </Shell>,
        SIZE
      )
    }

    // Default: meta overview.
    const report = await ds.getMetaReport(query)
    const top = report.rows.slice(0, 5)
    return new ImageResponse(
      <Shell view="meta">
        <Title text={`${formatName} Metagame`} />
        <Subtitle text={windowText} />
        <div style={{ display: 'flex', gap: 20, marginTop: 32 }}>
          <Kpi label="TOURNAMENTS" value={num(report.kpis.tournaments)} />
          <Kpi label="ENTRIES" value={num(report.kpis.entries)} />
          <Kpi label="MATCHES" value={num(report.kpis.matches)} />
        </div>
        <div
          style={{ display: 'flex', flexDirection: 'column', marginTop: 28 }}
        >
          {top.map((r: ArchetypeRowDTO) => (
            <ListRow
              key={String(r.slug)}
              rank={r.presenceRank}
              name={r.name}
              left={`${pct(r.share)} share`}
              right={pct(r.wr)}
              rightColor={r.wr >= 0.5 ? C.accent : C.bad}
            />
          ))}
        </div>
        <Spacer />
      </Shell>,
      SIZE
    )
  } catch {
    // Any failure (missing window, data source down, bad slug) → brand card.
    return new ImageResponse(
      <FallbackCard
        view={view}
        title={`${titleize(format)} metagame`}
        subtitle="MetaMage · MTG tournament analysis"
      />,
      SIZE
    )
  }
}
