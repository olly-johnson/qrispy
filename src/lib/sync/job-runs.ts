import type { TradeZeroSyncRequestedEvent } from "@/lib/sync/events";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type TradeZeroSyncEventData = TradeZeroSyncRequestedEvent["data"];

type TradeZeroSyncJobInput =
  | TradeZeroSyncEventData
  | {
      userId: string;
      fromDate: string;
      toDate: string;
      idempotencyKey: string;
      requestedBy?: "manual" | "schedule";
      syncScope?: "daily" | "backfill";
    };

type JobRunStatus = "queued" | "running" | "succeeded" | "failed";

type JobRunClient = {
  from(table: "job_runs"): {
    upsert(
      values: Record<string, unknown>,
      options: { onConflict: string },
    ): {
      select(columns: "id"): {
        single(): Promise<{
          data: { id: string } | null;
          error: unknown;
        }>;
      };
    };
  };
};

type JobRunOptions = {
  client?: unknown;
  id?: string;
  error?: unknown;
};

export async function recordTradeZeroSyncQueued(
  input: TradeZeroSyncEventData,
  options: JobRunOptions = {},
) {
  return upsertTradeZeroSyncJob(input, "queued", options);
}

export async function recordTradeZeroSyncRunning(
  input: TradeZeroSyncJobInput,
  options: JobRunOptions = {},
) {
  return upsertTradeZeroSyncJob(input, "running", options);
}

export async function recordTradeZeroSyncSucceeded(
  input: TradeZeroSyncJobInput,
  options: JobRunOptions = {},
) {
  return upsertTradeZeroSyncJob(input, "succeeded", options);
}

export async function recordTradeZeroSyncFailed(
  input: TradeZeroSyncJobInput,
  error: unknown,
  options: JobRunOptions = {},
) {
  return upsertTradeZeroSyncJob(input, "failed", { ...options, error });
}

async function upsertTradeZeroSyncJob(
  input: TradeZeroSyncJobInput,
  status: JobRunStatus,
  options: JobRunOptions,
) {
  const supabase = resolveJobRunClient(options.client);
  const normalized = normalizeJobInput(input);
  const values: Record<string, unknown> = {
    completed_at: null,
    error: null,
    user_id: normalized.userId,
    job_type: "tradezero_sync",
    status,
    idempotency_key: normalized.idempotencyKey,
    metadata: {
      from_date: normalized.fromDate,
      requested_by: normalized.requestedBy,
      sync_scope: normalized.syncScope,
      to_date: normalized.toDate,
    },
  };

  if (options.id) {
    values.id = options.id;
  }

  if (status === "running") {
    values.started_at = new Date().toISOString();
  }

  if (status === "succeeded" || status === "failed") {
    values.completed_at = new Date().toISOString();
  }

  if (status === "failed") {
    values.error = errorMessage(options.error);
  }

  const { data, error } = await supabase
    .from("job_runs")
    .upsert(values, { onConflict: "user_id,job_type,idempotency_key" })
    .select("id")
    .single();

  if (error) {
    throw error;
  }

  return data;
}

function createJobRunClient() {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for job writes");
  }

  return supabase as unknown as JobRunClient;
}

function resolveJobRunClient(client?: unknown) {
  return (client as JobRunClient | undefined) ?? createJobRunClient();
}

function normalizeJobInput(input: TradeZeroSyncJobInput) {
  if ("user_id" in input) {
    return {
      userId: input.user_id,
      requestedBy: input.requested_by,
      syncScope: input.sync_scope,
      fromDate: input.from_date,
      toDate: input.to_date,
      idempotencyKey: input.idempotency_key,
    };
  }

  return {
    userId: input.userId,
    requestedBy: input.requestedBy,
    syncScope: input.syncScope,
    fromDate: input.fromDate,
    toDate: input.toDate,
    idempotencyKey: input.idempotencyKey,
  };
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
