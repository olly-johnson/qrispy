type SyncJobStatusInput = {
  status: string;
  createdAt: string;
  completedAt: string | null;
  error: string | null;
};

export function describeLatestSyncJob(job: SyncJobStatusInput) {
  const timestamp = job.completedAt ?? job.createdAt;
  const message = `Latest sync ${job.status} at ${formatSyncDateTime(timestamp)}`;

  if (job.status === "failed" && job.error) {
    return `${message}: ${job.error}`;
  }

  return message;
}

function formatSyncDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(new Date(value));
}
