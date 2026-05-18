import React, { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteCharacter, listCharacters } from '../api/characters'
import CharacterForm from '../components/CharacterForm'
import type { CharacterRead } from '../types/character'

export default function CharacterEditorPage() {
  const navigate = useNavigate()
  const [characters, setCharacters] = useState<CharacterRead[]>([])
  const [selected, setSelected] = useState<CharacterRead | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const loadCharacters = useCallback(() => {
    setLoading(true)
    listCharacters()
      .then((chars) => {
        setCharacters(chars)
        setError(null)
      })
      .catch(() => setError('无法加载角色列表，请确保后端已启动'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadCharacters()
  }, [loadCharacters])

  const handleNew = () => {
    setSelected(null)
    setDeleteConfirm(false)
  }

  const handleSelect = (char: CharacterRead) => {
    setSelected(char)
    setDeleteConfirm(false)
  }

  const handleSaved = (saved: CharacterRead) => {
    setSelected(saved)
    loadCharacters()
  }

  const handleDelete = async () => {
    if (!selected) return
    if (!deleteConfirm) {
      setDeleteConfirm(true)
      return
    }
    setDeleting(true)
    try {
      await deleteCharacter(selected.id)
      setSelected(null)
      setDeleteConfirm(false)
      loadCharacters()
    } catch {
      alert('删除失败，请重试')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="editor-page">
      <div className="editor-header">
        <button className="btn btn-secondary" onClick={() => navigate('/')}>
          ← 返回首页
        </button>
        <h2 className="editor-title">角色编辑器</h2>
        <button className="btn btn-primary" onClick={handleNew}>
          + 新增角色
        </button>
      </div>

      <div className="editor-body">
        {/* 左侧角色列表 */}
        <aside className="editor-sidebar">
          <div className="sidebar-title">角色列表</div>
          {loading && <p className="loading-text">加载中...</p>}
          {error && <p className="error-text">{error}</p>}
          {!loading && !error && characters.length === 0 && (
            <p className="empty-text">暂无角色</p>
          )}
          <ul className="character-list">
            {characters.map((char) => (
              <li
                key={char.id}
                className={`character-list-item ${selected?.id === char.id ? 'selected' : ''}`}
                onClick={() => handleSelect(char)}
              >
                <div className="character-list-item-portrait">
                  {char.portraitImageUrl ? (
                    <img src={char.portraitImageUrl} alt={char.name} />
                  ) : (
                    <div className="portrait-placeholder-sm">
                      {char.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div className="character-list-item-info">
                  <div className="character-list-item-name">{char.name}</div>
                  <div className="character-list-item-stats">
                    HP:{char.maxHp} ATK:{char.baseAttack} SPD:{char.speed}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {selected && (
            <div className="sidebar-delete">
              {deleteConfirm ? (
                <div className="delete-confirm">
                  <p>确认删除「{selected.name}」？</p>
                  <div className="delete-confirm-buttons">
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={handleDelete}
                      disabled={deleting}
                    >
                      {deleting ? '删除中...' : '确认删除'}
                    </button>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => setDeleteConfirm(false)}
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <button className="btn btn-danger" onClick={handleDelete}>
                  删除角色
                </button>
              )}
            </div>
          )}
        </aside>

        {/* 右侧表单 */}
        <main className="editor-main">
          <CharacterForm character={selected} onSaved={handleSaved} />
        </main>
      </div>
    </div>
  )
}
