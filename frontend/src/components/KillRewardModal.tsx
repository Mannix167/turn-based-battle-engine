import React from 'react'
import type { PendingReward } from '../types/game'
import type { SkillTemplateRead } from '../types/skill'

interface Props {
  gameId: string
  pendingRewards: Record<string, PendingReward>
  templates: Record<string, SkillTemplateRead>
  onChoose: (killerId: string, templateId: string) => void
}

export default function KillRewardModal({ pendingRewards, templates, onChoose }: Props) {
  const entries = Object.entries(pendingRewards)
  if (entries.length === 0) return null

  const [rewardKey, reward] = entries[0]

  return (
    <div className="modal-overlay">
      <div className="modal-box kill-reward-modal">
        <div className="modal-title">🎉 击杀奖励</div>
        <div className="modal-subtitle">
          选择一个技能作为奖励（击杀者：{reward.killerEntityId}）
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
