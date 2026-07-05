import { redirect } from 'next/navigation'

// Format resolver (WP5): the app has no rootless view — always land on a
// format's meta overview. Standard is the default format (the design spike is
// the Standard ledger). The target `/meta/[format]` is this same work package.
//
// NOTE (deviation): the blueprint §2 routes table names `/meta/pauper` as the
// redirect target, but the WP5 task brief specifies `/meta/standard`. Following
// the task brief; flagged for WP7 to confirm the canonical default format.
export default function Home(): never {
  redirect('/meta/standard')
}
