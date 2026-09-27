import LedgerSpinner from '@/components/LedgerSpinner'

export default function Loading() {
  return (
    <div className="grid min-h-[52vh] place-items-center">
      <LedgerSpinner />
    </div>
  )
}
