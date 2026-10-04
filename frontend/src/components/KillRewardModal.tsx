import React from 'react'
import type { PendingReward } from '../types/game'
import type { SkillTemplateRead } from '../types/skill'
import GameImage from './GameImage'

interface Props {
  gameId: string
  pendingRewards: Record<string, PendingReward>
  templates: Record<string, SkillTemplateRead>
  onChoose: (killerId: string, templateId: string) => void
  entityNames?: Record<string, string>
}

export default function KillRewardModal({ pendingRewards, templates, onChoose, entityNames = {} }: Props) {
  const entries = Object.entries(pendingRewards)
  if (entries.length === 0) return null

  const [rewardKey, reward] = entries[0]

  return (
    <div className="modal-overlay">
      <div className="modal-box kill-reward-modal">
        <div className="modal-title">🎉 击杀奖励</div>
        <div className="modal-subtitle">
          选择一个技能作为奖励（击杀者：{entityNames[reward.killerEntityId] ?? reward.killerEntityId}）
        </div>
        <div className="reward-skill-list">
          {reward.availableTemplateIds.map((tid) => {
            const tmpl = templates[tid]
            return (
              <button
                key={tid}
                className="reward-skill-item btn"
                onClick={() => onChoose(reward.killerEntityId, tid)}
              >
                <GameImage className="reward-skill-icon" src={tmpl?.iconUrl} fallbackKind="skill" alt={tmpl?.name ?? '技能'} />
                <span className="reward-skill-name">{tmpl?.name ?? tid}</span>
                {tmpl && (
                  <span className="reward-skill-desc">{tmpl.description}</span>
                )}
              </button>
            )
          })}
        </div>
        <div className="modal-footer-note">请选择一个技能继续游戏</div>
      </div>
    </div>
  )
}
