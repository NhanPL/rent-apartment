import { apiRequest } from '../../services/apiClient'
import { API_ROUTES } from '../../services/apiRoutes'
import type { NotificationPage } from './types'

export const listNotifications = () => apiRequest<NotificationPage>(`${API_ROUTES.notifications.list}?page_size=10`)

export const markNotificationRead = (id: string) => apiRequest<void>(API_ROUTES.notifications.read(id), { method: 'PATCH' })

export const markAllNotificationsRead = () => apiRequest<void>(API_ROUTES.notifications.readAll, { method: 'POST' })
