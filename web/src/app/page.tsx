import { redirect } from 'next/navigation'

import { DEFAULT_FORMAT } from '@/datasource/format-order'

// Format resolver (WP5): the app has no rootless view — always land on a
// format's meta overview. The default is the most-played format (first in
// FORMAT_ORDER), currently Modern.
export default function Home(): never {
  redirect(`/meta/${DEFAULT_FORMAT}`)
}
