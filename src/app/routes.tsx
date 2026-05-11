import { Outlet, Route, Routes } from 'react-router-dom'

import { AdminHomePage } from '../pages/admin/AdminHomePage'
import { LoginPage } from '../pages/auth/LoginPage'
import { ChildTimelinePage } from '../pages/parent/ChildTimelinePage'
import { ParentHomePage } from '../pages/parent/ParentHomePage'
import { TeacherHomePage } from '../pages/teacher/TeacherHomePage'
import { RequireAuth } from './RequireAuth'
import { RoleRedirect } from './RoleRedirect'

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Outlet />
          </RequireAuth>
        }
      >
        <Route path="/" element={<RoleRedirect />} />
        <Route path="/parent" element={<ParentHomePage />} />
        <Route path="/parent/child/:id/timeline" element={<ChildTimelinePage />} />
        <Route path="/admin" element={<AdminHomePage />} />
        <Route path="/teacher" element={<TeacherHomePage />} />
      </Route>
    </Routes>
  )
}
