import client from './client'
import type { MonsterTemplateRead, MonsterTemplateWrite } from '../types/monster'

export async function listMonsterTemplates(includeDisabled = false): Promise<MonsterTemplateRead[]> {
  const res = await client.get<MonsterTemplateRead[]>('/api/monster-templates', {
    params: { include_disabled: includeDisabled },
  })
  return res.data
}

export async function createMonsterTemplate(payload: MonsterTemplateWrite): Promise<MonsterTemplateRead> {
  const res = await client.post<MonsterTemplateRead>('/api/monster-templates', payload)
  return res.data
}

export async function updateMonsterTemplate(
  id: string,
  payload: MonsterTemplateWrite
): Promise<MonsterTemplateRead> {
  const res = await client.put<MonsterTemplateRead>(`/api/monster-templates/${id}`, payload)
  return res.data
}

export async function deleteMonsterTemplate(id: string): Promise<void> {
  await client.delete(`/api/monster-templates/${id}`)
}

export async function duplicateMonsterTemplate(id: string): Promise<MonsterTemplateRead> {
  const res = await client.post<MonsterTemplateRead>(`/api/monster-templates/${id}/duplicate`)
  return res.data
}
