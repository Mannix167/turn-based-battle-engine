import client from './client'
import type { CharacterCreate, CharacterRead, CharacterUpdate } from '../types/character'

export async function listCharacters(): Promise<CharacterRead[]> {
  const res = await client.get<CharacterRead[]>('/api/characters')
  return res.data
}

export async function getCharacter(id: string): Promise<CharacterRead> {
  const res = await client.get<CharacterRead>(`/api/characters/${id}`)
  return res.data
}

export async function createCharacter(payload: CharacterCreate): Promise<CharacterRead> {
  const res = await client.post<CharacterRead>('/api/characters', payload)
  return res.data
}

export async function updateCharacter(id: string, payload: CharacterUpdate): Promise<CharacterRead> {
  const res = await client.put<CharacterRead>(`/api/characters/${id}`, payload)
  return res.data
}

export async function deleteCharacter(id: string): Promise<void> {
  await client.delete(`/api/characters/${id}`)
}
