import client from './client'
import type { GameStateRead, StartGameRequest, UseSkillPayload, Position, PreviewStartResponse, ActionPreviewRequest, ActionPreviewResponse } from '../types/game'

export async function createGame(mapId: string): Promise<GameStateRead> {
  const res = await client.post<GameStateRead>('/api/game/create', { mapId })
  return res.data
}

export async function getGame(gameId: string): Promise<GameStateRead> {
  const res = await client.get<GameStateRead>(`/api/game/${gameId}`)
  return res.data
}

export async function startGame(payload: StartGameRequest): Promise<GameStateRead> {
  const res = await client.post<GameStateRead>('/api/game/start', payload)
  return res.data
}

export async function previewStart(payload: StartGameRequest): Promise<PreviewStartResponse> {
  const res = await client.post<PreviewStartResponse>('/api/game/preview-start', payload)
  return res.data
}

export async function getActionPreview(payload: ActionPreviewRequest): Promise<ActionPreviewResponse> {
  const res = await client.post<ActionPreviewResponse>('/api/game/action-preview', payload)
  return res.data
}

export async function moveEntity(gameId: string, entityId: string, to: Position): Promise<GameStateRead> {
  const res = await client.post<GameStateRead>(`/api/game/${gameId}/move`, { entityId, to })
  return res.data
}

export async function basicAttack(gameId: string, attackerId: string, targetId: string): Promise<GameStateRead> {
  const res = await client.post<GameStateRead>(`/api/game/${gameId}/basic-attack`, { attackerId, targetId })
  return res.data
}

export async function attackTerrain(gameId: string, attackerId: string, targetCell: Position): Promise<GameStateRead> {
  const res = await client.post<GameStateRead>(`/api/game/${gameId}/attack-terrain`, { attackerId, targetCell })
  return res.data
}

export async function useSkill(gameId: string, payload: UseSkillPayload): Promise<GameStateRead> {
  const res = await client.post<GameStateRead>(`/api/game/${gameId}/use-skill`, payload)
  return res.data
}

export async function digTreasure(
  gameId: string,
  entityId: string,
  treasureId: string,
  failureDamage: number = 10
): Promise<GameStateRead> {
  const res = await client.post<GameStateRead>(`/api/game/${gameId}/dig-treasure`, {
    entityId,
    treasureId,
    failureDamage,
  })
  return res.data
}

export async function endAction(gameId: string, entityId: string): Promise<GameStateRead> {
  const res = await client.post<GameStateRead>(`/api/game/${gameId}/end-action`, { entityId })
  return res.data
}

export async function chooseKillReward(
  gameId: string,
  killerId: string,
  templateId: string
): Promise<GameStateRead> {
  const res = await client.post<GameStateRead>(`/api/game/${gameId}/choose-kill-reward`, {
    killerId,
    templateId,
  })
  return res.data
}
