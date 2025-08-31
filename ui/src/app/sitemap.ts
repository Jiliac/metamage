import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/prisma'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  const urls: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: new Date(),
    },
    {
      url: `${baseUrl}/sessions`,
      lastModified: new Date(),
    },
  ]

  const sessions = await prisma.chatSession.findMany({
    select: { id: true, updatedAt: true },
    orderBy: { updatedAt: 'desc' },
    take: 200,
  })

  for (const s of sessions) {
    urls.push({
      url: `${baseUrl}/sessions/${s.id}`,
      lastModified: s.updatedAt,
    })
  }

  return urls
}
