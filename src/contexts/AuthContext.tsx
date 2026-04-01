import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type UserRole = "admin" | "user" | "client" | "videographer" | "editor" | "connecta_plus";

interface AuthContextType {
  user: User | null;
  role: UserRole;
  loading: boolean;
  isAdmin: boolean;
  isUser: boolean;
  isVideographer: boolean;
  isEditor: boolean;
  isConnectaPlus: boolean;
  signOut: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<{ error: any }>;
  signUpWithEmail: (email: string, password: string, fullName?: string) => Promise<{ error: any }>;
  isPasswordRecovery: boolean;
  clearPasswordRecovery: () => void;
  requiresPasswordChange: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>("client");
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(false);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchRole = async (userId: string) => {
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .maybeSingle();
        if (isMounted && data) return data.role as UserRole;
      } catch {
        // ignore
      }
      return "client" as UserRole;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[AuthProvider] onAuthStateChange:", event, "user:", session?.user?.email ?? "null");
        if (!isMounted) return;

        if (event === "PASSWORD_RECOVERY") {
          setIsPasswordRecovery(true);
        }

        const u = session?.user ?? null;
        setUser(u);

        if (u) {
          setRequiresPasswordChange(u.user_metadata?.force_password_change === true);
          setRoleLoading(true);
          // Use setTimeout to avoid Supabase auth deadlock
          setTimeout(() => {
            fetchRole(u.id).then((r) => {
              if (isMounted) {
                setRole(r);
                setRoleLoading(false);
              }
            });
          }, 0);
        } else {
          setRole("client");
          setRoleLoading(false);
          setRequiresPasswordChange(false);
        }

        // Mark loading done on initial session
        if (event === "INITIAL_SESSION") {
          // If there's a user, wait for role to load before marking done
          if (!u) {
            setLoading(false);
          }
          // else loading will be set to false after role resolves
        }
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // When role finishes loading, mark overall loading as done
  useEffect(() => {
    if (user && !roleLoading && loading) {
      setLoading(false);
    }
  }, [user, roleLoading, loading]);
  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole("client");
    window.location.href = "/";
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string, fullName?: string) => {
    // Sign up without email verification requirement
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Don't send confirmation email - user can login immediately
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: fullName || email },
      },
    });

    // Note: With Supabase auto-confirm disabled, users can login right away
    return { error };
  }, []);

  const clearPasswordRecovery = useCallback(() => setIsPasswordRecovery(false), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        role,
        loading,
        isAdmin: role === "admin",
        isUser: role === "user",
        isVideographer: role === "videographer",
        isEditor: role === "editor",
        isConnectaPlus: role === "connecta_plus",
        signOut,
        signInWithEmail,
        signUpWithEmail,
        isPasswordRecovery,
        clearPasswordRecovery,
        requiresPasswordChange,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
