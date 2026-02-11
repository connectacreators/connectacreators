import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type UserRole = "admin" | "client" | null;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<UserRole>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);

  const fetchRole = async (userId: string): Promise<UserRole> => {
    try {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .maybeSingle();
      return (data?.role as UserRole) ?? "client";
    } catch {
      return "client";
    }
  };

  useEffect(() => {
    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          const r = await fetchRole(u.id);
          setRole(r);
        } else {
          setRole(null);
        }
        setLoading(false);
        initialized.current = true;
      }
    );

    // Then check existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      // Only set if onAuthStateChange hasn't fired yet
      if (!initialized.current) {
        const u = session?.user ?? null;
        setUser(u);
        if (u) {
          const r = await fetchRole(u.id);
          setRole(r);
        }
        setLoading(false);
        initialized.current = true;
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setRole(null);
  };

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  };

  const signUpWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: window.location.origin },
    });
    return { error };
  };

  return { user, role, loading, signOut, signInWithEmail, signUpWithEmail, isAdmin: role === "admin" };
}
