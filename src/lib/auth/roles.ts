import type { UserRole } from '@/types/user'

export function isEventStaffRole(role: UserRole): boolean {
  return role === 'cashier' || role === 'sinpe_ops'
}

export function canManageUnassignedSinpe(role: UserRole): boolean {
  return role === 'admin' || role === 'sinpe_ops'
}
