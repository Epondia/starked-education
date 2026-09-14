'use client';

import { useCallback, useEffect, useState } from 'react';
import { Search, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';

interface AuditLog {
  id: number;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  outcome: 'success' | 'failure';
  statusCode: number | null;
  requestId: string | null;
  ipAddress: string | null;
  details: Record<string, unknown>;
  entryHash: string;
  occurredAt: string;
}

interface AuditResponse {
  auditLogs: AuditLog[];
  pagination: { page: number; limit: number; total: number; pages: number };
}

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [outcome, setOutcome] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [chainStatus, setChainStatus] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (action) params.set('action', action);
      if (outcome) params.set('outcome', outcome);
      if (search) params.set('search', search);
      const response = await fetch(`/api/v1/admin/audit-logs?${params}`);
      if (!response.ok) throw new Error('Unable to load audit logs');
      const data: AuditResponse = await response.json();
      setLogs(data.auditLogs);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [action, outcome, page, search]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const verifyChain = async () => {
    const response = await fetch('/api/v1/admin/audit-logs/verify');
    setChainStatus(response.ok ? 'The audit chain is valid.' : 'The audit chain could not be verified.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Audit Logs</h1>
          <p className="mt-1 text-sm text-gray-600">Review sensitive operations and verify the append-only audit chain.</p>
        </div>
        <button onClick={verifyChain} className="flex items-center gap-2 rounded-lg border border-blue-200 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50">
          <ShieldCheck className="h-4 w-4" /> Verify chain
        </button>
      </div>

      {chainStatus && <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">{chainStatus}</p>}

      <div className="grid grid-cols-1 gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-3">
        <label className="relative">
          <span className="sr-only">Search audit logs</span>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search action, resource, request" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm" />
        </label>
        <select value={action} onChange={(event) => { setPage(1); setAction(event.target.value); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">All actions</option>
          <option value="auth.login">Auth login</option>
          <option value="auth.register">Auth registration</option>
          <option value="admin.settings">Admin settings</option>
          <option value="auth.assign-role">Role changes</option>
        </select>
        <select value={outcome} onChange={(event) => { setPage(1); setOutcome(event.target.value); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">All outcomes</option>
          <option value="success">Successful</option>
          <option value="failure">Failed</option>
        </select>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase text-gray-500">
            <tr><th className="px-4 py-3">Time</th><th className="px-4 py-3">Actor</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Outcome</th><th className="px-4 py-3">Request</th><th className="px-4 py-3">Hash</th></tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">Loading audit logs…</td></tr> : logs.length === 0 ? <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">No audit logs match these filters.</td></tr> : logs.map((log) => (
              <tr key={log.id} className="align-top hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">{new Date(log.occurredAt).toLocaleString()}</td>
                <td className="px-4 py-3"><div>{log.actorId || 'anonymous'}</div><div className="text-xs text-gray-500">{log.actorRole || 'unknown role'}</div></td>
                <td className="px-4 py-3 font-medium text-gray-800">{log.action}</td>
                <td className="px-4 py-3"><span className={log.outcome === 'success' ? 'text-green-700' : 'text-red-700'}>{log.outcome}</span>{log.statusCode ? <div className="text-xs text-gray-500">HTTP {log.statusCode}</div> : null}</td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{log.requestId || '—'}</td>
                <td className="max-w-[10rem] truncate px-4 py-3 font-mono text-xs text-gray-500" title={log.entryHash}>{log.entryHash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-600">
        <span>Page {page}</span>
        <div className="flex gap-2">
          <button disabled={page === 1} onClick={() => setPage((current) => current - 1)} className="rounded border p-2 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
          <button disabled={logs.length < 25} onClick={() => setPage((current) => current + 1)} className="rounded border p-2 disabled:opacity-40" aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>
    </div>
  );
}
