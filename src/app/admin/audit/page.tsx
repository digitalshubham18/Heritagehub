"use client";
import { useApi } from "@/lib/hooks";
import { Card, Empty, ErrorState, PageSkeleton } from "@/components/ui";

export default function AuditPage() {
  const { data, loading, error, reload } = useApi<any>("/api/admin/audit");
  return (
    <div className="space-y-5"><h1 className="text-3xl">Audit log</h1>
      <p className="text-sm text-ink/70">Every administrator change to destinations, slots, users and bookings, newest first.</p>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading ? <PageSkeleton /> : !data.items.length ? <Empty title="No admin actions recorded yet" /> : (
        <Card className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="bg-forest-50 text-left"><tr>{["When", "Who", "Action", "Details"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr></thead>
          <tbody>{data.items.map((a: any) => <tr key={a._id} className="border-t border-forest/10"><td className="p-3 whitespace-nowrap">{new Date(a.createdAt).toLocaleString("en-IN")}</td><td className="p-3">{a.actorName}</td><td className="p-3 font-mono text-xs">{a.action}</td><td className="p-3">{a.summary}</td></tr>)}</tbody></table></Card>)}
    </div>
  );
}
