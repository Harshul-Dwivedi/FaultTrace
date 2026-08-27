import type {
  TFSession,
  TFTurn,
  TFSessionEventItem,
  TFListResponse,
  TFSingleResponse,
} from './types'

const BASE_URL = process.env.NEXT_PUBLIC_TRUEFORGE_URL || ''

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`)
  return res.json()
}

export async function fetchSessions(): Promise<TFSession[]> {
  const res = await apiFetch<TFListResponse<TFSession>>('/api/v1/sessions')
  return res.data
}

export async function fetchSession(id: string): Promise<TFSession> {
  const res = await apiFetch<TFSingleResponse<TFSession>>(`/api/v1/sessions/${id}`)
  return res.data
}

export async function fetchTurns(sessionId: string): Promise<TFTurn[]> {
  const res = await apiFetch<TFListResponse<TFTurn>>(
    `/api/v1/sessions/${sessionId}/turns`
  )
  return res.data
}

export async function fetchSessionEvents(sessionId: string): Promise<TFSessionEventItem[]> {
  const res = await apiFetch<TFListResponse<TFSessionEventItem>>(
    `/api/v1/sessions/${sessionId}/events`
  )
  return res.data
}

export async function fetchTurnEvents(
  sessionId: string,
  turnId: string
): Promise<TFSessionEventItem[]> {
  const res = await apiFetch<TFListResponse<TFSessionEventItem>>(
    `/api/v1/sessions/${sessionId}/turns/${turnId}/events`
  )
  return res.data
}
