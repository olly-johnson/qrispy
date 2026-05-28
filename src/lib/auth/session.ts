import { redirect } from "next/navigation";

import { getOwnerUserId, getPublicSupabaseConfig } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AppUser = {
  id: string;
  email?: string;
};

export function isSupabaseConfigured() {
  return getPublicSupabaseConfig() != null;
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const supabase = await createSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const ownerUserId = getOwnerUserId();
  if (ownerUserId && user.id !== ownerUserId) {
    await supabase.auth.signOut();
    return null;
  }

  return {
    id: user.id,
    email: user.email ?? undefined,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
