import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@components/ui/badge'
import { Button } from '@components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@components/ui/card'
import { Check } from 'lucide-react'
import type { MainWindowAPI, PatternInfo } from '@types'

const SIGHTING_FILTERS = [
  { label: 'All', min: 1 },
  { label: '3+', min: 3 },
  { label: '5+', min: 5 },
  { label: '10+', min: 10 },
] as const

const EyeIcon = (): React.JSX.Element => (
  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
)

interface ReviewStackProps {
  patterns: PatternInfo[]
  onApprove: (id: string) => void
  onDismiss: (id: string) => void
}

function ReviewStack({ patterns, onApprove, onDismiss }: ReviewStackProps): React.JSX.Element {
  const visible = patterns.slice(0, 3)
  const top = visible[0]
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setExpanded(false)
  }, [top.id])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.repeat) return
      if (e.key === 'a') {
        e.preventDefault()
        onApprove(top.id)
      } else if (e.key === 'd') {
        e.preventDefault()
        onDismiss(top.id)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [top, onApprove, onDismiss])

  const stackStyles = [
    'relative z-30',
    'absolute inset-x-0 top-2 z-20 scale-[0.97] opacity-60 pointer-events-none',
    'absolute inset-x-0 top-4 z-10 scale-[0.94] opacity-30 pointer-events-none',
  ]

  return (
    <div className="relative">
      {visible.map((pattern, i) => (
        <Card key={pattern.id} className={stackStyles[i]}>
          {i === 0 ? (
            <>
              <CardHeader>
                <CardTitle className="text-sm truncate">
                  {top.name}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground">
                      <EyeIcon />
                      {top.sightingCount}
                    </span>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <p className={`text-xs text-muted-foreground ${expanded ? '' : 'line-clamp-3'}`}>
                    {top.automationIdea || top.description}
                  </p>
                  {!expanded && (
                    <button
                      className="absolute bottom-0 right-0 text-xs underline text-muted-foreground hover:text-foreground bg-gradient-to-l from-card from-60% to-transparent pl-6"
                      onClick={() => setExpanded(true)}
                    >
                      more
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => onApprove(top.id)}
                  >
                    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-white/20 bg-white/10 px-1 text-[10px] font-medium mr-1.5">
                      A
                    </kbd>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => onDismiss(top.id, top.name)}
                  >
                    Not useful
                    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-current/20 bg-current/10 px-1 text-[10px] font-medium ml-1.5">
                      D
                    </kbd>
                  </Button>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  1 of {patterns.length} to review
                </p>
              </CardContent>
            </>
          ) : (
            /* Peek cards just need minimal height to show the stacked effect */
            <CardContent className="py-6" />
          )}
        </Card>
      ))}
    </div>
  )
}

interface PatternCardProps {
  pattern: PatternInfo
  onSolved: (id: string) => void
  onCopyPrompt: (pattern: PatternInfo) => void
}

function PatternCard({ pattern, onSolved, onCopyPrompt }: PatternCardProps): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {pattern.name}
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-flex items-center gap-0.5 text-xs font-normal text-muted-foreground">
              <EyeIcon />
              {pattern.sightingCount}
            </span>
          </div>
        </CardTitle>
        <CardAction>
          {pattern.completedAt ? (
            <Button variant="outline" size="xs" disabled>
              <Check className="w-3 h-3" /> Done
            </Button>
          ) : (
            <Button variant="ghost" size="xs" onClick={() => onSolved(pattern.id)}>
              <Check className="w-3 h-3" /> Complete
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {pattern.automationIdea || pattern.description}
        </p>
        {!pattern.completedAt && (
          <Button size="sm" className="w-full" onClick={() => onCopyPrompt(pattern)}>
            Copy prompt for Claude
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

interface PatternsSectionProps {
  api: MainWindowAPI
}

export function PatternsSection({ api }: PatternsSectionProps): React.JSX.Element | null {
  const [allPatterns, setAllPatterns] = useState<PatternInfo[] | null>(null)
  const [minSightings, setMinSightings] = useState(3)
  const [detectionEnabled, setDetectionEnabled] = useState<boolean | null>(null)

  useEffect(() => {
    const load = (): void => {
      api
        .getPatterns()
        .then(setAllPatterns)
        .catch(() => setAllPatterns([]))
      api
        .getCaptureSettings()
        .then((s) => setDetectionEnabled(s.patternDetectionEnabled))
        .catch(() => setDetectionEnabled(true))
    }
    load()
    window.addEventListener('focus', load)
    return () => window.removeEventListener('focus', load)
  }, [api])

  const newPatterns = useMemo(
    () => allPatterns?.filter((p) => p.approvedAt === null) ?? [],
    [allPatterns],
  )

  const reviewedPatterns = useMemo(
    () =>
      (
        allPatterns?.filter((p) => p.approvedAt !== null && p.sightingCount >= minSightings) ?? []
      ).sort((a, b) => {
        const aCompleted = a.completedAt !== null ? 1 : 0
        const bCompleted = b.completedAt !== null ? 1 : 0
        if (aCompleted !== bCompleted) return aCompleted - bCompleted
        return b.sightingCount - a.sightingCount
      }),
    [allPatterns, minSightings],
  )

  const handleApprove = useCallback(
    (id: string) => {
      setAllPatterns((prev) =>
        prev ? prev.map((p) => (p.id === id ? { ...p, approvedAt: Date.now() } : p)) : prev,
      )
      api.approvePattern(id).catch(() => {
        // approval persisted best-effort
      })
    },
    [api],
  )

  const handleDismiss = useCallback(
    (id: string) => {
      setAllPatterns((prev) => (prev ? prev.filter((p) => p.id !== id) : prev))
      api.rejectPattern(id).catch(() => {
        // rejection persisted best-effort
      })
    },
    [api],
  )

  const handleComplete = useCallback(
    (id: string) => {
      setAllPatterns((prev) =>
        prev ? prev.map((p) => (p.id === id ? { ...p, completedAt: Date.now() } : p)) : prev,
      )
      api.completePattern(id).catch(() => {
        // completion persisted best-effort
      })
    },
    [api],
  )

  const handleCopyPrompt = useCallback(
    (pattern: PatternInfo) => {
      const prompt = [
        `I want to automate this recurring workflow: "${pattern.name}".`,
        ``,
        `Use the MemoryLane MCP tools to research it before proposing a solution:`,
        ``,
        `1. Run search_patterns with query "${pattern.name}" to find the pattern and get its ID.`,
        `2. Run get_pattern_details with that pattern ID to see all sightings and the evidence for each.`,
        `3. Pick 3-5 sightings with the highest confidence and collect their activity IDs.`,
        `4. Run get_activity_details on those activity IDs to read the actual on-screen text (OCR) — this shows exactly what I was doing step by step.`,
        `5. Based on the real evidence, propose a concrete automation plan: what triggers the workflow, what each step does, and which tools or integrations to use (apps involved: ${pattern.apps.join(', ')}).`,
        ``,
        `Keep the plan actionable — specific tools, APIs, or scripts I can set up, not vague advice.`,
      ].join('\n')
      navigator.clipboard.writeText(prompt).then(() => {
        toast.success('Copied! Paste it into your Claude desktop app')
      })
      api.markPatternPromptCopied(pattern.id).catch(() => {
        // timestamp persisted best-effort
      })
    },
    [api],
  )

  if (allPatterns === null) return null

  if (detectionEnabled === false) {
    return (
      <div className="space-y-3">
        <h2 className="text-sm font-medium">Automation Opportunities</h2>
        <p className="text-xs text-muted-foreground">
          MemoryLane can analyze your daily activity to find repetitive workflows you could
          automate.
        </p>
        <Button
          size="sm"
          onClick={() => {
            setDetectionEnabled(true)
            api.saveCaptureSettings({ patternDetectionEnabled: true }).then((result) => {
              if (result.success) {
                toast.success('Automation opportunities enabled')
              }
            })
          }}
        >
          Start discovering
        </Button>
      </div>
    )
  }

  if (allPatterns.length === 0) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">Automation Opportunities</h2>
        <Badge variant="secondary">{newPatterns.length + reviewedPatterns.length} found</Badge>
      </div>

      {newPatterns.length > 0 && (
        <ReviewStack patterns={newPatterns} onApprove={handleApprove} onDismiss={handleDismiss} />
      )}

      <div className="flex items-center gap-1">
        <span className="text-xs text-muted-foreground mr-1">Sightings:</span>
        {SIGHTING_FILTERS.map((f) => (
          <button
            key={f.min}
            onClick={() => setMinSightings(f.min)}
            className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
              minSightings === f.min
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {reviewedPatterns.map((pattern) => (
        <PatternCard
          key={pattern.id}
          pattern={pattern}
          onSolved={handleComplete}
          onCopyPrompt={handleCopyPrompt}
        />
      ))}
    </div>
  )
}
