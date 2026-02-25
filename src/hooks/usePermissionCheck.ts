import { useAuth } from "@/hooks/useAuth";

export type PermissionLevel = "admin" | "staff" | "user" | "anyone";

/**
 * Hook to check user permissions against required level.
 *
 * Permission hierarchy:
 * - admin: Only admin users
 * - staff: Admin or videographer
 * - user: Admin, videographer, or authenticated user
 * - anyone: Any user (logged in or not)
 */
export function usePermissionCheck(requiredLevel: PermissionLevel = "user") {
  const { user, isAdmin, isVideographer, loading } = useAuth();

  const hasPermission = (): boolean => {
    if (loading) return false;

    switch (requiredLevel) {
      case "admin":
        return isAdmin;
      case "staff":
        return isAdmin || isVideographer;
      case "user":
        return !!user;
      case "anyone":
        return true;
      default:
        return false;
    }
  };

  return {
    hasPermission: hasPermission(),
    isLoading: loading,
    isAdmin,
    isVideographer,
    isAuthenticated: !!user,
  };
}
