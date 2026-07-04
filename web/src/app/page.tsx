import { redirect } from 'next/navigation'

// Format resolver: the app has no rootless view — always land on a format's meta
// overview. Pauper is the default format (blueprint §2 routes table).
export default function Home(): never {
  redirect('/meta/pauper')
}
