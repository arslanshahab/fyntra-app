import { Outlet, Route, Routes } from 'react-router-dom'

import { AdminLayout } from '../components/templates/AdminLayout'
import { TeacherLayout } from '../components/templates/TeacherLayout'
import { AdminCardsPage } from '../pages/admin/AdminCardsPage'
import { AdminDashboardPage } from '../pages/admin/AdminDashboardPage'
import { AdminDevicesPage } from '../pages/admin/AdminDevicesPage'
import { AdminNotificationsPage } from '../pages/admin/AdminNotificationsPage'
import { AdminReportsPage } from '../pages/admin/AdminReportsPage'
import { AdminStudentDetailPage } from '../pages/admin/AdminStudentDetailPage'
import { AdminStudentsPage } from '../pages/admin/AdminStudentsPage'
import { LoginPage } from '../pages/auth/LoginPage'
import { ChildTimelinePage } from '../pages/parent/ChildTimelinePage'
import { ParentHomePage } from '../pages/parent/ParentHomePage'
import { TeacherHistoryPage } from '../pages/teacher/TeacherHistoryPage'
import { TeacherTodayPage } from '../pages/teacher/TeacherTodayPage'
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
          <Route path="reports" element={<AdminReportsPage />} />
          <Route path="notifications" element={<AdminNotificationsPage />} />
        </Route>
        <Route
          path="/teacher"
          element={
            <RequireRole role="teacher">
              <TeacherLayout />
            </RequireRole>
          }
        >
          <Route index element={<TeacherTodayPage />} />
          <Route path="history" element={<TeacherHistoryPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
