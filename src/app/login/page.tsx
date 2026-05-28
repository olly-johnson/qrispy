import { redirect } from "next/navigation";

import { getCurrentUser, isSupabaseConfigured } from "@/lib/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function signIn(formData: FormData) {
  "use server";

  const supabase = await createSupabaseServerClient();
  if (!supabase) {
    redirect("/login?error=supabase-not-configured");
  }

  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect("/login?error=invalid-credentials");
  }

  redirect("/dashboard");
}

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07090d] px-5 text-zinc-100">
      <form
        action={signIn}
        className="w-full max-w-sm rounded-md border border-white/10 bg-white/[0.045] p-6"
      >
        <div className="text-sm uppercase tracking-[0.2em] text-emerald-300">Qrispy</div>
        <h1 className="mt-4 text-2xl font-semibold">Owner sign in</h1>
        <div className="mt-6 space-y-4">
          <label className="block text-sm text-zinc-300">
            Email
            <input
              name="email"
              type="email"
              required
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-emerald-300"
            />
          </label>
          <label className="block text-sm text-zinc-300">
            Password
            <input
              name="password"
              type="password"
              required
              className="mt-2 h-11 w-full rounded-md border border-white/10 bg-zinc-950 px-3 text-zinc-100 outline-none focus:border-emerald-300"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={!isSupabaseConfigured()}
          className="mt-6 h-11 w-full rounded-md bg-emerald-300 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          Sign in
        </button>
        {!isSupabaseConfigured() ? (
          <p className="mt-4 text-sm text-amber-200">
            Supabase environment variables are needed before login is available.
          </p>
        ) : null}
      </form>
    </main>
  );
}
