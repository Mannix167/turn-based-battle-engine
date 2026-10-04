import React, { useEffect, useRef } from 'react'

interface Props {
  logs: string[]
}

function classifyLog(text: string): string {
  const lower = text.toLowerCase()
  if (lower.includes('死亡') || lower.includes('killed') || lower.includes('dies') || lower.includes('died')) return 'log-death'
  if (lower.includes('治疗') || lower.includes('heal') || lower.includes('恢复')) return 'log-heal'
  if (lower.includes('伤害') || lower.includes('damage') || lower.includes('攻击') || lower.includes('attack')) return 'log-damage'
  if (lower.includes('buff') || lower.includes('灼烧') || lower.includes('眩晕') || lower.includes('状态')) return 'log-buff'
  if (lower.includes('结盟') || lower.includes('alliance')) return 'log-alliance'
  if (lower.includes('移动') || lower.includes('move')) return 'log-move'
  if (lower.includes('技能') || lower.includes('skill') || lower.includes('cast')) return 'log-skill'
  if (lower.includes('回合') || lower.includes('round') || lower.includes('turn')) return 'log-round'
  return 'log-default'
}

export default function BattleLog({ logs }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const displayLogs = logs.slice(-200)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  return (
    <div className="battle-log">
      <div className="battle-log-title">战斗日志</div>
      <div className="battle-log-body">
        {displayLogs.map((line, i) => (
          <div key={i} className={`log-line ${classifyLog(line)}`}>
            <span className="log-idx">{logs.length - displayLogs.length + i + 1}</span>
            <span className="log-text">{line}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
