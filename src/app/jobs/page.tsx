import { AppShell } from "@/components/app-shell";
import { formatDateTime } from "@/components/format";
import { requireUser } from "@/lib/auth/session";
import { getDashboardData } from "@/lib/app-data";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const user = await requireUser();
  const data = await getDashboardData(user.id);

  return (
    <AppShell user={user}>
      <h1 className="text-2xl font-semibold">Sync jobs</h1>
      <div className="mt-4 overflow-hidden rounded-md border border-white/10">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-white/[0.04] text-xs uppercase tracking-[0.14em] text-zinc-500">
            <tr>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Started</th>
              <th className="px-4 py-3">Completed</th>
              <th className="px-4 py-3">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {data.jobs.map((job) => (
              <tr key={job.id}>
                <td className="px-4 py-3">{job.jobType}</td>
                <td className="px-4 py-3">{job.status}</td>
                <td className="px-4 py-3 text-zinc-400">{formatDateTime(job.createdAt)}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {formatDateTime(job.completedAt)}
                </td>
                <td className="px-4 py-3 text-rose-200">{job.error ?? "--"}</td>
              </tr>
            ))}
            {data.jobs.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-zinc-500" colSpan={5}>
                  No sync jobs yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
