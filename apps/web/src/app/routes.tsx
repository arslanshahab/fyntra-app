import { lazy, Suspense } from 'react'
import { Outlet, Route, Routes } from 'react-router-dom'

import { Spinner } from '../components/atoms/Spinner'
import { LoginPage } from '../pages/auth/LoginPage'
import { RequireAuth } from './RequireAuth'
import { RequireRole } from './RequireRole'
import { RoleRedirect } from './RoleRedirect'

// LoginPage is eager so the first-paint of a fresh session has no
// Suspense flash. Everything else is split per-role so admins don't
// download the parent home and vice versa.
const AdminLayout = lazy(() =>
  import('../components/templates/AdminLayout').then((m) => ({ default: m.AdminLayout })),
)
const TeacherLayout = lazy(() =>
  import('../components/templates/TeacherLayout').then((m) => ({ default: m.TeacherLayout })),
)

const AdminDashboardPage = lazy(() =>
  import('../pages/admin/AdminDashboardPage').then((m) => ({ default: m.AdminDashboardPage })),
)
const AdminStudentsPage = lazy(() =>
  import('../pages/admin/AdminStudentsPage').then((m) => ({ default: m.AdminStudentsPage })),
)
const AdminStudentDetailPage = lazy(() =>
  import('../pages/admin/AdminStudentDetailPage').then((m) => ({
    default: m.AdminStudentDetailPage,
  })),
)
const AdminCardsPage = lazy(() =>
  import('../pages/admin/AdminCardsPage').then((m) => ({ default: m.AdminCardsPage })),
)
const AdminDevicesPage = lazy(() =>
  import('../pages/admin/AdminDevicesPage').then((m) => ({ default: m.AdminDevicesPage })),
)
const AdminDeviceDetailPage = lazy(() =>
  import('../pages/admin/AdminDeviceDetailPage').then((m) => ({
    default: m.AdminDeviceDetailPage,
  })),
)
const AdminReportsPage = lazy(() =>
  import('../pages/admin/AdminReportsPage').then((m) => ({ default: m.AdminReportsPage })),
)
const AdminNotificationsPage = lazy(() =>
  import('../pages/admin/AdminNotificationsPage').then((m) => ({
    default: m.AdminNotificationsPage,
  })),
)
const AdminAnomalyCenter = lazy(() =>
  import('../pages/admin/AdminAnomalyCenter').then((m) => ({ default: m.AdminAnomalyCenter })),
)
const AdminCalendarPage = lazy(() =>
  import('../pages/admin/AdminCalendarPage').then((m) => ({ default: m.AdminCalendarPage })),
)
const AdminPolicyPage = lazy(() =>
  import('../pages/admin/AdminPolicyPage').then((m) => ({ default: m.AdminPolicyPage })),
)
const AdminClassRegisterPage = lazy(() =>
  import('../pages/admin/AdminClassRegisterPage').then((m) => ({
    default: m.AdminClassRegisterPage,
  })),
)

const ParentHomePage = lazy(() =>
  import('../pages/parent/ParentHomePage').then((m) => ({ default: m.ParentHomePage })),
)
const ChildTimelinePage = lazy(() =>
  import('../pages/parent/ChildTimelinePage').then((m) => ({ default: m.ChildTimelinePage })),
)
const ParentSettingsPage = lazy(() =>
  import('../pages/parent/ParentSettingsPage').then((m) => ({ default: m.ParentSettingsPage })),
)

const TeacherTodayPage = lazy(() =>
  import('../pages/teacher/TeacherTodayPage').then((m) => ({ default: m.TeacherTodayPage })),
)
const TeacherHistoryPage = lazy(() =>
  import('../pages/teacher/TeacherHistoryPage').then((m) => ({ default: m.TeacherHistoryPage })),
)
const TeacherRegisterPage = lazy(() =>
  import('../pages/teacher/TeacherRegisterPage').then((m) => ({ default: m.TeacherRegisterPage })),
)

// Dev-only: design system reference page. The lazy import lives inside the
// import.meta.env.DEV branch so production builds tree-shake it out entirely.
const StyleguidePage = import.meta.env.DEV
  ? lazy(() =>
      import('../pages/dev/StyleguidePage').then((m) => ({ default: m.StyleguidePage })),
    )
  : null

function FullPageSpinner() {
  return (
    <div role="status" className="min-h-dvh flex items-center justify-center bg-stone-50">
      <Spinner size="lg" />
    </div>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      {StyleguidePage ? (
        <Route
          path="/dev/styleguide"
          element={
            <Suspense fallback={<FullPageSpinner />}>
              <StyleguidePage />
            </Suspense>
          }
        />
      ) : null}
      <Route
        element={
          <RequireAuth>
            <Suspense fallback={<FullPageSpinner />}>
              <Outlet />
            </Suspense>
          </RequireAuth>
        }
      >
        <Route path="/" element={<RoleRedirect />} />
        <Route path="/parent" element={<ParentHomePage />} />
        <Route path="/parent/child/:id/timeline" element={<ChildTimelinePage />} />
        <Route path="/parent/settings" element={<ParentSettingsPage />} />
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
          <Route path="devices/:id" element={<AdminDeviceDetailPage />} />
          <Route path="reports" element={<AdminReportsPage />} />
          <Route path="notifications" element={<AdminNotificationsPage />} />
          <Route path="anomalies" element={<AdminAnomalyCenter />} />
          <Route path="calendar" element={<AdminCalendarPage />} />
          <Route path="policy" element={<AdminPolicyPage />} />
          <Route path="register" element={<AdminClassRegisterPage />} />
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
          <Route path="register" element={<TeacherRegisterPage />} />
          <Route path="history" element={<TeacherHistoryPage />} />
        </Route>
      </Route>
    </Routes>
  )
}
