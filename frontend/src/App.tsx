import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import HomePage from './pages/HomePage'
import CharacterEditorPage from './pages/CharacterEditorPage'
import MapEditorPage from './pages/MapEditorPage'
import SkillEditorPage from './pages/SkillEditorPage'
import MonsterManagerPage from './pages/MonsterManagerPage'
import SetupPage from './pages/SetupPage'
import BattlePage from './pages/BattlePage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/characters" element={<CharacterEditorPage />} />
      <Route path="/maps" element={<MapEditorPage />} />
      <Route path="/skills" element={<SkillEditorPage />} />
      <Route path="/monsters" element={<MonsterManagerPage />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/battle/:gameId" element={<BattlePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
