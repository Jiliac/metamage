export default function LedgerSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        aria-label={label ?? 'Consulting the ledger'}
        role="status"
        className="ledger-spin h-7 w-7 rounded-full border-2 border-solid border-[var(--line)] border-t-[var(--gold)]"
      />
      <p className="text-[11px] uppercase tracking-[0.18em] text-ink-3">
        {label ?? 'Consulting the ledger'}
      </p>
    </div>
  )
}
