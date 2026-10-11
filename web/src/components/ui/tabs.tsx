'use client'

import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

// ---------------------------------------------------------------------------
// Tabs — the Ledger's tab row (§9): a hairline rule with the active tab
// underlined in gold, the same treatment as the primary nav's active link,
// instead of shadcn's raised pill strip. Radix primitives underneath.
// ---------------------------------------------------------------------------

function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-2', className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'flex w-full items-end gap-6 overflow-x-auto border-b border-line',
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        '-mb-px inline-flex items-center gap-1.5 border-b-2 border-transparent py-2 text-[13.5px] tracking-[0.04em] whitespace-nowrap text-ink-2 no-underline transition-colors',
        'max-md:min-h-[44px]',
        'hover:text-ink',
        'data-[state=active]:border-gold data-[state=active]:font-semibold data-[state=active]:text-gold',
        'focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold',
        'disabled:pointer-events-none disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1 outline-none', className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
