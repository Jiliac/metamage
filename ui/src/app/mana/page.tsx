'use client'

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import manaData from '@/data/mana-tables.json'

interface PatternData {
  [turn: string]: number
}

interface ManaConfig {
  deck_size: number
  land_count: number
  patterns: {
    [pattern: string]: PatternData
  }
}

// Pattern metadata for display
const PATTERN_INFO: Record<
  string,
  { label: string; description: string; cmc: string }
> = {
  C: {
    label: 'C',
    description: 'Single colored mana',
    cmc: '1',
  },
  CC: {
    label: 'CC',
    description: 'Double colored mana',
    cmc: '2',
  },
  CCC: {
    label: 'CCC',
    description: 'Triple colored mana',
    cmc: '3',
  },
  '1C': {
    label: '1C',
    description: '1 generic + 1 colored',
    cmc: '2',
  },
  '2C': {
    label: '2C',
    description: '2 generic + 1 colored',
    cmc: '3',
  },
  '3C': {
    label: '3C',
    description: '3 generic + 1 colored',
    cmc: '4',
  },
  '4C': {
    label: '4C',
    description: '4 generic + 1 colored',
    cmc: '5',
  },
  '5C': {
    label: '5C',
    description: '5 generic + 1 colored',
    cmc: '6',
  },
  '1CC': {
    label: '1CC',
    description: '1 generic + 2 colored',
    cmc: '3',
  },
  '2CC': {
    label: '2CC',
    description: '2 generic + 2 colored',
    cmc: '4',
  },
  '3CC': {
    label: '3CC',
    description: '3 generic + 2 colored',
    cmc: '5',
  },
  '1CCC': {
    label: '1CCC',
    description: '1 generic + 3 colored',
    cmc: '4',
  },
}

export default function ManaPage() {
  const [selectedLandCount, setSelectedLandCount] = useState(40)

  // Get data for selected land count
  const currentConfig = (manaData as ManaConfig[]).find(
    config => config.land_count === selectedLandCount
  )

  if (!currentConfig) {
    return <div>No data available</div>
  }

  // Get all available land counts
  const availableLandCounts = (manaData as ManaConfig[])
    .map(c => c.land_count)
    .sort((a, b) => a - b)

  // Get all unique patterns
  const patterns = Object.keys(currentConfig.patterns).sort((a, b) => {
    // Sort by CMC, then alphabetically
    const cmcA = parseInt(PATTERN_INFO[a]?.cmc || '99')
    const cmcB = parseInt(PATTERN_INFO[b]?.cmc || '99')
    if (cmcA !== cmcB) return cmcA - cmcB
    return a.localeCompare(b)
  })

  // Get all unique turns across all patterns
  const getAllTurns = (pattern: string): number[] => {
    const turns = Object.keys(currentConfig.patterns[pattern] || {}).map(Number)
    return turns.sort((a, b) => a - b)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 pt-24 pb-16">
      <main className="container mx-auto px-6 max-w-7xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-4">
            Mana Base Calculator
          </h1>
          <p className="text-lg text-slate-300 max-w-3xl mx-auto mb-2">
            Based on Frank Karsten&apos;s methodology - determine how many
            colored sources you need to consistently cast your spells
          </p>
          <p className="text-sm text-slate-400">
            99-card Duel Commander • London Mulligan • 90% consistency threshold
          </p>
        </div>

        {/* Main Card */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <CardTitle className="text-white text-2xl mb-2">
                  Source Requirements by Turn
                </CardTitle>
                <CardDescription className="text-slate-300">
                  Tables show minimum colored sources needed to cast spells on
                  curve
                </CardDescription>
              </div>

              {/* Land Count Selector */}
              <div className="flex flex-wrap gap-2">
                <span className="text-slate-300 text-sm self-center mr-2">
                  Total lands:
                </span>
                {availableLandCounts.map(count => (
                  <button
                    key={count}
                    onClick={() => setSelectedLandCount(count)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      selectedLandCount === count
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    }`}
                  >
                    {count}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            <Tabs defaultValue={patterns[0]} className="w-full">
              <TabsList className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-12 w-full bg-slate-700/50">
                {patterns.map(pattern => (
                  <TabsTrigger
                    key={pattern}
                    value={pattern}
                    className="text-xs md:text-sm text-white data-[state=active]:text-slate-900"
                  >
                    {PATTERN_INFO[pattern]?.label || pattern}
                  </TabsTrigger>
                ))}
              </TabsList>

              {patterns.map(pattern => {
                const turns = getAllTurns(pattern)
                const patternData = currentConfig.patterns[pattern]

                return (
                  <TabsContent key={pattern} value={pattern} className="mt-6">
                    {/* Pattern Description */}
                    <div className="mb-4 p-4 bg-slate-700/30 rounded-lg border border-slate-600">
                      <div className="flex items-start gap-2">
                        <Badge
                          variant="outline"
                          className="bg-cyan-600/20 text-cyan-300 border-cyan-600"
                        >
                          {PATTERN_INFO[pattern]?.label || pattern}
                        </Badge>
                        <div className="flex-1">
                          <p className="text-slate-200 text-sm">
                            {PATTERN_INFO[pattern]?.description ||
                              'Unknown pattern'}
                          </p>
                          <p className="text-slate-400 text-xs mt-1">
                            CMC: {PATTERN_INFO[pattern]?.cmc || 'N/A'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="rounded-lg border border-slate-600 overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-700/50 hover:bg-slate-700/50">
                            <TableHead className="text-slate-200 font-semibold w-32">
                              Turn
                            </TableHead>
                            {turns.map(turn => (
                              <TableHead
                                key={turn}
                                className="text-slate-200 font-semibold text-center"
                              >
                                T{turn}
                              </TableHead>
                            ))}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <TableRow className="bg-slate-800/50">
                            <TableCell className="text-slate-300 font-medium">
                              Sources Needed
                            </TableCell>
                            {turns.map(turn => {
                              const sources = patternData[turn]
                              return (
                                <TableCell
                                  key={turn}
                                  className="text-center text-white font-bold text-lg"
                                >
                                  <span className="inline-block px-3 py-1 bg-cyan-600/30 rounded">
                                    {sources}
                                  </span>
                                </TableCell>
                              )
                            })}
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>

                    {/* Explanation */}
                    <div className="mt-4 p-3 bg-slate-700/20 rounded text-sm text-slate-300">
                      <p>
                        <strong className="text-cyan-400">How to use:</strong>{' '}
                        If you want to cast a {pattern} spell on turn {turns[0]}
                        , you need at least{' '}
                        <strong className="text-white">
                          {patternData[turns[0]]}
                        </strong>{' '}
                        sources of that color in your deck with{' '}
                        {selectedLandCount} total lands.
                      </p>
                    </div>
                  </TabsContent>
                )
              })}
            </Tabs>
          </CardContent>
        </Card>

        {/* Footer Info */}
        <div className="mt-8 text-center text-sm text-slate-400">
          <p>
            Data generated using Frank Karsten&apos;s simulation methodology
            (2013) with London Mulligan rules.
          </p>
          <p className="mt-1">
            Based on 100,000 iterations per configuration • 90% consistency
            target • Duel Commander (no free mulligan)
          </p>
        </div>
      </main>
    </div>
  )
}
