"use client";

// @group Configuration > Imports : React, icons, and cluster context
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  RefreshCw,
  Users,
  Search,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
} from "lucide-react";
import { useServer } from '@/contexts/ServerContext';

// @group Types : Component data contracts
interface ConsumerGroupInfo {
  groupId: string;
  members: number;
  state: string;
  protocol: string;
  subscriptions: string[];
}

interface ConsumerGroupsProps {
  onRefresh?: () => void;
}

// @group BusinessLogic : Component state and interactions
export default function ConsumerGroups({ onRefresh }: ConsumerGroupsProps) {
  const { selectedProfileId, connectionKey, error: configError } = useServer();
  const [consumerGroups, setConsumerGroups] = useState<ConsumerGroupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"groupId" | "members" | "state">("members");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [intervalMs, setIntervalMs] = useState(5000);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const requestSequence = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  // @group APIEndpoints : Discard responses from superseded profile selections
  const fetchConsumerGroups = useCallback(async () => {
    const sequence = ++requestSequence.current;
    controllerRef.current?.abort();
    if (!selectedProfileId) {
      setLoading(false);
      setError(configError || 'Select a cluster to view its consumer groups');
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/consumer-groups?profileId=${encodeURIComponent(selectedProfileId)}`, { signal: controller.signal });
      const data = await response.json();
      if (sequence !== requestSequence.current) return;
      if (!response.ok) throw new Error(data.error || 'Failed to fetch consumer groups');
      setConsumerGroups(data);
    } catch (err) {
      if (sequence !== requestSequence.current) return;
      setConsumerGroups([]);
      setError(err instanceof Error ? err.message : 'Failed to fetch consumer groups');
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [selectedProfileId, configError]);

  useEffect(() => {
    setConsumerGroups([]);
    setExpanded({});
  }, [connectionKey]);

  // @group BusinessLogic > Refresh : Wait for each request before scheduling the next
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      await fetchConsumerGroups();
      if (active && autoRefresh) timerRef.current = setTimeout(refresh, intervalMs);
    };
    void refresh();
    return () => {
      active = false;
      requestSequence.current += 1;
      controllerRef.current?.abort();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoRefresh, intervalMs, connectionKey, fetchConsumerGroups]);

  const handleRefresh = () => {
    fetchConsumerGroups();
    onRefresh?.();
  };

  const getStateColor = (state: string) => {
    switch (state.toLowerCase()) {
      case 'stable':
        return 'bg-success/10 text-success border border-success/20';
      case 'rebalancing':
        return 'bg-warning/10 text-warning border border-warning/20';
      case 'empty':
        return 'bg-subtle text-muted border border-line';
      default:
        return 'bg-danger/5 text-danger border border-danger/20';
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? consumerGroups.filter((g) =>
          g.groupId.toLowerCase().includes(q) ||
          g.subscriptions.some((s) => s.toLowerCase().includes(q))
        )
      : consumerGroups.slice();
    base.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "members") cmp = a.members - b.members;
      else if (sortBy === "groupId") cmp = a.groupId.localeCompare(b.groupId);
      else if (sortBy === "state") cmp = a.state.localeCompare(b.state);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return base;
  }, [consumerGroups, query, sortBy, sortDir]);

  const totalConsumers = filtered.reduce((sum, group) => sum + group.members, 0);

  const toggleExpand = (groupId: string) => setExpanded(prev => ({ ...prev, [groupId]: !prev[groupId] }));

  const exportJSON = () => {
    const data = JSON.stringify(filtered, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consumer-groups-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const header = ['groupId','members','state','protocol','subscriptions'].join(',');
    const rows = filtered.map(g => [
      JSON.stringify(g.groupId),
      g.members,
      JSON.stringify(g.state),
      JSON.stringify(g.protocol || ''),
      JSON.stringify(g.subscriptions.join(';')),
    ].join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consumer-groups-${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-w-0 max-w-full space-y-3">
      {/* @group Presentation : Page header and workspace controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
          <h1 className="text-xl font-semibold text-ink tracking-tight">Consumer groups</h1>
          <div className="flex items-center gap-4 text-xs text-muted">
            <span><strong className="font-semibold tabular-nums text-ink">{loading && consumerGroups.length === 0 ? '\u2014' : filtered.length}</strong> groups</span>
            <span><strong className="font-semibold tabular-nums text-ink">{loading && consumerGroups.length === 0 ? '\u2014' : totalConsumers}</strong> consumers</span>
          </div>
        </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="dev-btn inline-flex items-center"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin text-accent' : ''}`} />
            Refresh
          </button>
      </div>

      {/* @group Presentation > Toolbar : Search, sorting, refresh, and export controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            aria-label="Search consumer groups"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search groups or topics..."
            className="dev-input w-full !pl-8"
          />
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <select
            aria-label="Sort consumer groups by"
            value={sortBy}
            onChange={(e) => setSortBy((e.target.value as 'members' | 'groupId' | 'state'))}
            className="dev-input"
          >
            <option value="members">Members</option>
            <option value="groupId">Group ID</option>
            <option value="state">State</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="dev-btn"
            title="Toggle sort direction"
          >
            {sortDir === 'asc' ? 'Ascending' : 'Descending'}
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted xl:ml-auto">
          <label className="flex items-center gap-2 cursor-pointer hover:text-accent transition-colors">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded-md bg-subtle border-line text-accent focus:ring-accent focus:ring-1 focus:ring-offset-0 focus:ring-offset-surface" />
            Auto-refresh
          </label>
          <div className="flex items-center gap-2">
            <label htmlFor="group-refresh-interval" className="text-xs">Every</label>
            <select id="group-refresh-interval" value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))} className="dev-input">
              <option value={3000}>3s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
            </select>
          </div>
          <div className="flex gap-1.5">
            <button onClick={exportJSON} className="dev-btn flex items-center">
              <Download className="w-3 h-3 mr-1.5" /> JSON
            </button>
            <button onClick={exportCSV} className="dev-btn flex items-center">
              <Download className="w-3 h-3 mr-1.5" /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* @group Presentation > Groups : Group membership and subscription table */}
      {error ? (
        <div role="alert" className="rounded-lg bg-danger/5 border border-danger/20 p-4 text-sm text-danger">
          {error}
        </div>
      ) : filtered.length === 0 && !loading ? (
        <div className="dev-card px-4 py-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-subtle">
            <Users className="w-5 h-5 text-muted" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-ink mb-2">No consumer groups found</h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            Try a different search or connect a consumer to this cluster.
          </p>
        </div>
      ) : (
        <div className="dev-card min-w-0 max-w-full overflow-hidden">
          <div className="max-w-full overflow-x-auto">
            <table className="min-w-full divide-y divide-line" aria-label="Consumer groups" aria-busy={loading}>
              <thead className="bg-subtle">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted">Group ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted">Members</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted">State</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted">Protocol</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted">Subscriptions</th>
                  <th className="relative px-3 py-2"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-line">
                {loading && consumerGroups.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center">
                      <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Loading consumer groups...
                      </span>
                    </td>
                  </tr>
                )}
                {filtered.map((group) => {
                  const isOpen = !!expanded[group.groupId];
                  return (
                    <tr key={group.groupId} className="hover:bg-subtle transition-colors group/row">
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="min-w-0">
                            <div className="text-[13px] font-mono text-ink truncate max-w-[280px]" title={group.groupId}>{group.groupId}</div>
                          </div>
                          <button
                            className="shrink-0 p-2 text-muted hover:text-accent hover:bg-accent-soft rounded-md transition-colors"
                            title="Copy group ID"
                            aria-label={`Copy group ID ${group.groupId}`}
                            onClick={async () => { try { await navigator.clipboard.writeText(group.groupId); } catch {} }}
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`w-1.5 h-1.5 rounded-full mr-2.5 ${group.members > 0 ? 'bg-success' : 'bg-muted'}`}></div>
                          <span className="text-[13px] font-mono tabular-nums text-ink">{group.members}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className={`dev-badge ${getStateColor(group.state)}`}>{group.state}</span>
                      </td>
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <div className="text-[13px] text-muted">{group.protocol || 'N/A'}</div>
                      </td>
                      <td className="px-3 py-1.5">
                          {group.subscriptions.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5 min-w-48 max-w-lg">
                              {(isOpen ? group.subscriptions : group.subscriptions.slice(0, 6)).map((topic, i) => (
                                <span key={i} title={topic} className="dev-badge font-mono bg-subtle border-line text-ink truncate max-w-48">
                                  {topic}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-muted">No subscriptions</span>
                          )}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                          {group.subscriptions.length > 6 && (
                            <button
                              onClick={() => toggleExpand(group.groupId)}
                              aria-expanded={isOpen}
                              aria-label={`${isOpen ? 'Show fewer' : 'Show all'} subscriptions for ${group.groupId}`}
                              className="dev-btn inline-flex items-center"
                            >
                              {isOpen ? (<><ChevronUp className="w-3.5 h-3.5 mr-1" /> Less</>) : (<><ChevronDown className="w-3.5 h-3.5 mr-1" /> All</>)}
                            </button>
                          )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
