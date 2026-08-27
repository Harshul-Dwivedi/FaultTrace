'use client'

import { useState, useEffect, useCallback } from 'react'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { VehicleHeader } from './components/VehicleHeader'
import { EvidenceTimeline } from './components/EvidenceTimeline'
import { Hypotheses } from './components/Hypotheses'
import { TestMatrix } from './components/TestMatrix'
import { GateLog } from './components/GateLog'
import { CostTracker } from './components/CostTracker'
import { ReportModal } from './components/ReportModal'
import { PanelSkeleton, VehicleSkeleton, SidebarSkeleton } from './components/LoadingStates'
import type {
  SessionCard,
  InvestigationData,
  TFSession,
  TFTurn,
  TFSessionEventItem,
} from '../lib/types'
import { fetchSessions, fetchTurns, fetchSessionEvents } from '../lib/api'
import { parseEvidenceTimeline } from '../lib/parsers/evidence'
import { parseHypotheses } from '../lib/parsers/hypotheses'
import { parseInfoGain } from '../lib/parsers/infoGain'
import { parseGateLog } from '../lib/parsers/gates'
import { parseVehicleInfo } from '../lib/parsers/vehicle'
import { parseCost } from '../lib/parsers/cost'

function sessionToCard(s: TFSession, turns: TFTurn[]): SessionCard {
  const lastTurn = turns[0]
  const status = lastTurn?.state.status === 'running'
    ? 'RUNNING'
    : lastTurn?.state.status === 'error'
      ? 'ERROR'
      : turns.length > 0
        ? 'CLOSED'
        : 'ACTIVE'

  let duration = ''
  if (lastTurn?.state.status === 'done' && lastTurn.state.completed_at) {
    const ms = new Date(lastTurn.state.completed_at).getTime() - new Date(lastTurn.created_at).getTime()
    const secs = Math.round(ms / 1000)
    duration = secs >= 60 ? `${Math.floor(secs / 60)}m ${secs % 60}s` : `${secs}s`
  }

  const cost = turns.reduce((sum, t) => {
    const m = t.state.status === 'done' || t.state.status === 'error' || t.state.status === 'cancelled'
      ? t.state.metrics
      : undefined
    return sum + (m?.total_cost_in_usd || 0)
  }, 0)

  // Try to extract vehicle from title or first turn output
  const vehicle = s.title || 'Unknown Vehicle'

  // Try to extract issue from title
  const issue = s.title || 'Investigation'

  return {
    id: s.id,
    vehicle,
    issue,
    timestamp: new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    status,
    cost,
    duration,
  }
}

function getAgentOutput(events: TFSessionEventItem[]): string {
  const parts: string[] = []
  for (const { event } of events) {
    if (event.type === 'model.message' && event.content) {
      parts.push(event.content)
    }
  }
  return parts.join('\n')
}

export default function Page() {
  const [sessions, setSessions] = useState<SessionCard[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string>('')
  const [menu, setMenu] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingSessions, setLoadingSessions] = useState(true)
  const [loadingInvestigation, setLoadingInvestigation] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [showReport, setShowReport] = useState(false)

  const [investigation, setInvestigation] = useState<InvestigationData>({
    vehicle: null,
    evidence: [],
    hypotheses: [],
    tests: [],
    gates: [],
    cost: null,
    status: 'idle',
  })

  // Load sessions on mount
  const loadSessions = useCallback(async () => {
    try {
      setLoadingSessions(true)
      setApiError(null)
      const tfSessions = await fetchSessions()

      // Fetch turns for each session to get status/cost
      const cards = await Promise.all(
        tfSessions.map(async (s) => {
          try {
            const turns = await fetchTurns(s.id)
            return sessionToCard(s, turns)
          } catch {
            return sessionToCard(s, [])
          }
        })
      )

      setSessions(cards)
      if (cards.length > 0 && !activeSessionId) {
        setActiveSessionId(cards[0].id)
      }
    } catch (err) {
      setApiError(`Cannot reach TrueForge server at localhost:8790 — ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setLoadingSessions(false)
    }
  }, [activeSessionId])

  useEffect(() => { loadSessions() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Load investigation data when session changes
  useEffect(() => {
    if (!activeSessionId) return

    let cancelled = false

    async function loadInvestigation() {
      setLoadingInvestigation(true)
      setInvestigation((prev) => ({ ...prev, status: 'loading' }))

      try {
        const [events, turns] = await Promise.all([
          fetchSessionEvents(activeSessionId),
          fetchTurns(activeSessionId),
        ])

        if (cancelled) return

        // Sort events chronologically (API returns newest first)
        events.sort((a, b) => {
          const ta = new Date(a.event.created_at || 0).getTime()
          const tb = new Date(b.event.created_at || 0).getTime()
          return ta - tb
        })

        const agentOutput = getAgentOutput(events)
        const vehicle = parseVehicleInfo(events)
        const evidence = parseEvidenceTimeline(events)
        const hypotheses = parseHypotheses(agentOutput)
        const tests = parseInfoGain(agentOutput, evidence)
        const gates = parseGateLog(events)
        const cost = parseCost(turns)

        const lastTurn = turns[0]
        const status = lastTurn?.state.status === 'running'
          ? 'running'
          : lastTurn?.state.status === 'error'
            ? 'error'
            : 'done'

        setInvestigation({
          vehicle,
          evidence,
          hypotheses,
          tests,
          gates,
          cost,
          status,
        })
      } catch (err) {
        if (!cancelled) {
          setInvestigation((prev) => ({
            ...prev,
            status: 'error',
            error: err instanceof Error ? err.message : 'Failed to load investigation',
          }))
        }
      } finally {
        if (!cancelled) setLoadingInvestigation(false)
      }
    }

    loadInvestigation()
    return () => { cancelled = true }
  }, [activeSessionId])

  const refresh = () => {
    setRefreshing(true)
    loadSessions().then(() => {
      if (activeSessionId) {
        // Re-trigger investigation load
        setActiveSessionId((prev) => prev)
      }
      setTimeout(() => setRefreshing(false), 400)
    })
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const canExport = !!activeSessionId && (investigation.hypotheses.length > 0 || investigation.evidence.length > 0)
  const reportTitle = activeSession?.issue || activeSessionId || 'faulttrace'

  return (
    <div className="app-shell">
      <Header
        onMenu={() => setMenu(true)}
        onRefresh={refresh}
        refreshing={refreshing}
        onExport={() => setShowReport(true)}
        canExport={canExport}
      />
      {showReport && canExport && (
        <ReportModal data={investigation} title={reportTitle} onClose={() => setShowReport(false)} />
      )}
      <Sidebar
        sessions={sessions}
        active={activeSessionId}
        onSelect={setActiveSessionId}
        open={menu}
        onClose={() => setMenu(false)}
        loading={loadingSessions}
      />
      <main className="workspace">
        <div className="workspace-inner">
          {/* API Error Banner */}
          {apiError && (
            <div style={{
              background: '#3a2028',
              border: '1px solid #5a3038',
              borderRadius: 2,
              padding: '12px 16px',
              marginBottom: 18,
              color: '#ff8990',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <span>{apiError}</span>
              <button
                onClick={refresh}
                style={{
                  background: 'transparent',
                  border: '1px solid #5a3038',
                  color: '#ff8990',
                  padding: '4px 10px',
                  borderRadius: 2,
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Breadcrumb */}
          <div className="breadcrumb">
            <span>INVESTIGATIONS</span>
            <b>/</b>
            <span className="current">{activeSessionId ? activeSessionId.slice(0, 12) : '—'}</span>
            {investigation.status === 'running' && <span className="status-badge">RUNNING</span>}
            {investigation.status === 'done' && <span className="status-badge">COMPLETE</span>}
          </div>

          {/* Title Row */}
          <div className="title-row">
            <div>
              <p className="overline">INVESTIGATION {activeSessionId ? activeSessionId.slice(0, 12) : ''}</p>
              <h1>{activeSession?.issue || 'Select an investigation'}</h1>
              {activeSession && (
                <p className="subtitle">
                  {activeSession.timestamp} · {activeSession.duration || 'In progress'}
                  {activeSession.cost > 0 && ` · $${activeSession.cost.toFixed(3)}`}
                </p>
              )}
            </div>
          </div>

          {/* Vehicle Header */}
          {loadingInvestigation ? <VehicleSkeleton /> : <VehicleHeader vehicle={investigation.vehicle} />}

          {/* Main Grid: Evidence + Hypotheses */}
          <div className="grid-two">
            {loadingInvestigation ? (
              <>
                <PanelSkeleton />
                <PanelSkeleton />
              </>
            ) : (
              <>
                <EvidenceTimeline items={investigation.evidence} />
                <Hypotheses items={investigation.hypotheses} />
              </>
            )}
          </div>

          {/* Test Matrix */}
          {loadingInvestigation ? <PanelSkeleton /> : <TestMatrix tests={investigation.tests} />}

          {/* Bottom Grid: Gate Log + Cost */}
          <div className="bottom-grid">
            {loadingInvestigation ? <PanelSkeleton /> : <GateLog entries={investigation.gates} />}
            {loadingInvestigation ? <PanelSkeleton /> : <CostTracker cost={investigation.cost} />}
          </div>
        </div>
      </main>
    </div>
  )
}
