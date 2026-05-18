import client from './client'
import type { SkillTemplateRead, SkillTemplateWrite } from '../types/skill'

export async function listCharacterSkillTemplates(): Promise<SkillTemplateRead[]> {
  const res = await client.get<SkillTemplateRead[]>('/api/skills/templates/character')
  return res.data
}

export async function listAllSkillTemplates(): Promise<SkillTemplateRead[]> {
  const res = await client.get<SkillTemplateRead[]>('/api/skills/templates?include_disabled=true')
  return res.data
}

export async function listEnabledSkillTemplates(): Promise<SkillTemplateRead[]> {
  const res = await client.get<SkillTemplateRead[]>('/api/skills/templates')
  return res.data
}

export async function listCommonSkillTemplates(): Promise<SkillTemplateRead[]> {
  const res = await client.get<SkillTemplateRead[]>('/api/skills/templates/common')
  return res.data
}

export async function createSkillTemplate(payload: SkillTemplateWrite): Promise<SkillTemplateRead> {
  const res = await client.post<SkillTemplateRead>('/api/skills/templates', payload)
  return res.data
}

export async function updateSkillTemplate(id: string, payload: SkillTemplateWrite): Promise<SkillTemplateRead> {
  const res = await client.put<SkillTemplateRead>(`/api/skills/templates/${id}`, payload)
  return res.data
}

export async function deleteSkillTemplate(id: string): Promise<void> {
  await client.delete(`/api/skills/templates/${id}`)
}

export async function duplicateSkillTemplate(id: string): Promise<SkillTemplateRead> {
  const res = await client.post<SkillTemplateRead>(`/api/skills/templates/${id}/duplicate`)
  return res.data
}
