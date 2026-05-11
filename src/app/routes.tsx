import { Route, Routes } from 'react-router-dom'

import { WelcomePage } from '../pages/welcome/WelcomePage'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<WelcomePage />} />
    </Routes>
  )
}
