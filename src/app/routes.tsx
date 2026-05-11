import { Outlet, Route, Routes } from 'react-router-dom'

import { AdminLayout } from '../components/templates/AdminLayout'
import { AdminCardsPage } from '../pages/admin/AdminCardsPage'
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage'
import { AdminDevicesPage } from '../pages/admin/AdminDevicesPage'
import { AdminStudentDetailPage } from '../pages/admin/AdminStudentDetailPage'
import { AdminStudentsPage } from '../pages/admin/AdminStudentsPage'
import { LoginPage } from '../pages/auth/LoginPage'
import { ChildTimelinePage } from '../pages/parent/ChildTimelinePage'
import { ParentHomePage } from '../pages/parent/ParentHomePage'
import { TeacherHomePage } from '../pages/teacher/TeacherHomePage'
import { RequireAuth } from './RequireAuth'
import { RequireRole } from './RequireRole'
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
        <Route
          path="/admin"
          element={
            <RequireRole role="admin">
              <AdminLayout />
            </RequireRole>
          }
        >
          <Route index element={<AdminDashboardPage />} />
          <Route path="students" element={<AdminStudentsPage />} />
          <Route path="students/:id" element={<AdminStudentDetailPage />} />
          <Route path="cards" element={<AdminCardsPage />} />
          <Route path="devices" element={<AdminDevicesPage />} />
        </Route>
        <Route path="/teacher" element={<TeacherHomePage />} />
      </Route>
    </Routes>
  )
}
