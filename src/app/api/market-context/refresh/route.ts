import { getCurrentUser } from "@/lib/auth/session";
import { getMarketContextConfig } from "@/lib/env";
import {
  createOpenAiMarketContextProvider,
  refreshMarketContextBrief,
} from "@/lib/market-data/market-context";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Sign in to refresh market context." }, { status: 401 });
  }

  const config = getMarketContextConfig();
  if (!config) {
    return Response.json({ error: "OpenAI API key is not configured for market context." }, { status: 400 });
  }

  const client = createSupabaseAdminClient();
  if (!client) {
    return Response.json({ error: "Supabase service role is not configured." }, { status: 503 });
  }

  const result = await refreshMarketContextBrief({
    client,
    provider: createOpenAiMarketContextProvider(config),
  });

  if (!result.canRefresh) {
    return Response.json(
      { error: "Market context refresh is available on US trading days only." },
      { status: 409 },
    );
  }

  if (result.error || !result.brief) {
    return Response.json(
      { error: `Unable to refresh market context right now. ${result.error ?? "No brief was returned."}` },
      { status: 502 },
    );
  }

  return Response.json({ brief: result.brief });
}
