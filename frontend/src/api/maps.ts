import client from './client'
import type { MapRead, MapValidationResult, MapWrite } from '../types/map'

export async function listMaps(): Promise<MapRead[]> {
  const res = await client.get<MapRead[]>('/api/maps')
  return res.data
}

export async function getMap(id: string): Promise<MapRead> {
  const res = await client.get<MapRead>(`/api/maps/${id}`)
  return res.data
}

export async function createMap(payload: MapWrite): Promise<MapRead> {
  const res = await client.post<MapRead>('/api/maps', payload)
  return res.data
}

export async function updateMap(id: string, payload: MapWrite): Promise<MapRead> {
  const res = await client.put<MapRead>(`/api/maps/${id}`, payload)
  return res.data
}

export async function deleteMap(id: string): Promise<void> {
  await client.delete(`/api/maps/${id}`)
}

export async function duplicateMap(id: string): Promise<MapRead> {
  const res = await client.post<MapRead>(`/api/maps/${id}/duplicate`)
  return res.data
}

export async function validateMap(id: string): Promise<MapValidationResult> {
  const res = await client.post<MapValidationResult>(`/api/maps/${id}/validate`)
  return res.data
}

export async function previewRandomGeneration(payload: MapWrite): Promise<unknown> {
  const res = await client.post('/api/maps/preview-random-generation', payload)
  return res.data
}
