import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type UserRole = "admin" | "client" | "videographer";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>("client");
  const [loading, setLoading] = useState(true);

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

    // Listener for ongoing changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log("[useAuth] onAuthStateChange:", event, "user:", session?.user?.email ?? "null");
        if (!isMounted) return;
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          fetchRole(u.id).then((r) => { if (isMounted) { console.log("[useAuth] role resolved:", r); setRole(r); } });
        } else {
          setRole("client");
        }
      }
    );

    // Initial load
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          const r = await fetchRole(u.id);
          if (isMounted) setRole(r);
        }
      } catch (e) {
        console.error("Auth init error:", e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole("client");
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUpWithEmail = async (email: string, password: string, fullName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { full_name: fullName || email },
      },
    });
    return { error };
  };

  return { user, role, loading, signOut, signInWithEmail, signUpWithEmail, isAdmin: role === "admin", isVideographer: role === "videographer" };
}
