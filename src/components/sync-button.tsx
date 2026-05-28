import { RefreshCw } from "lucide-react";

import { requestTradeZeroSync } from "@/app/actions";

export function SyncButton() {
  return (
    <form action={requestTradeZeroSync}>
      <button
        type="submit"
        className="inline-flex h-10 items-center gap-2 rounded-md bg-emerald-300 px-4 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-200"
      >
        <RefreshCw className="h-4 w-4" />
        Sync TradeZero
      </button>
    </form>
  );
}
