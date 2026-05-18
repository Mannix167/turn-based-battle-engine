import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listCharacters } from '../api/characters'
import type { CharacterRead } from '../types/character'

export default function HomePage() {
  const navigate = useNavigate()
  const [characters, setCharacters] = useState<CharacterRead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listCharacters()
      .then(setCharacters)
      .catch(() => setError('无法加载角色列表，请确保后端已启动'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="home-page">
      <div className="home-header">
        <h1 className="home-title">回合制战棋游戏 v2</h1>
        <p className="home-subtitle">战棋式回合制沙盒游戏</p>
        <div className="home-actions">
          <button
            className="btn btn-primary btn-large"
            onClick={() => navigate('/setup')}
          >
            ⚔️ 开始游戏
          </button>
          <button
            className="btn btn-secondary btn-large"
            onClick={() => navigate('/characters')}
          >
            🎭 角色编辑器
          </button>
          <button
            className="btn btn-secondary btn-large"
            onClick={() => navigate('/maps')}
          >
            地图编辑器
          </button>
          <button
            className="btn btn-secondary btn-large"
            onClick={() => navigate('/skills')}
          >
            技能管理
          </button>
        </div>
      </div>

      <div className="home-content">
        <h2>现有角色</h2>
        {loading && <p className="loading-text">加载中...</p>}
        {error && <p className="error-text">{error}</p>}
        {!loading && !error && characters.length === 0 && (
          <p className="empty-text">暂无角色，前往角色编辑器创建。</p>
        )}
        <div className="character-grid">
          {characters.map((char) => (
            <div
              key={char.id}
              className="character-card"
              onClick={() => navigate('/characters')}
              title={`点击编辑 ${char.name}`}
            >
              <div className="character-card-portrait">
                {char.portraitImageUrl ? (
                  <img src={char.portraitImageUrl} alt={char.name} />
                ) : (
                  <div className="portrait-placeholder">
                    {char.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="character-card-info">
                <div className="character-card-name">{char.name}</div>
                <div className="character-card-stats">
                  <span>HP: {char.maxHp}</span>
                  <span>ATK: {char.baseAttack}</span>
                  <span>SPD: {char.speed}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
