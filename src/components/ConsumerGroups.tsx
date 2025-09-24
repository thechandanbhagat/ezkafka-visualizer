"use client";

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
import { useActiveProfileId } from '@/contexts/ServerContext';

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

export default function ConsumerGroups({ onRefresh }: ConsumerGroupsProps) {
  const selectedProfileId = useActiveProfileId();
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

  const fetchConsumerGroups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/consumer-groups?profileId=${encodeURIComponent(selectedProfileId || '')}`);
      if (!response.ok) {
        throw new Error('Failed to fetch consumer groups');
      }
      
      const data = await response.json();
      setConsumerGroups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch consumer groups');
      console.error('Error fetching consumer groups:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedProfileId]);

  useEffect(() => {
    fetchConsumerGroups();
  }, [fetchConsumerGroups]);

  // Auto-refresh logic
  useEffect(() => {
    if (!autoRefresh) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => fetchConsumerGroups(), intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [autoRefresh, intervalMs, fetchConsumerGroups]);

  const handleRefresh = () => {
    fetchConsumerGroups();
    onRefresh?.();
  };

  const getStateColor = (state: string) => {
    switch (state.toLowerCase()) {
      case 'stable':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
      case 'rebalancing':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'empty':
        return 'bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-300';
      default:
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
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
    <div className="space-y-4">
      {/* Header */}
      <div className="h-12 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-md flex items-center justify-center">
            <Users className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold">Consumer Groups</h1>
            <p className="text-[11px] text-slate-500">Monitor group membership and subscriptions</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
          <div className="hidden md:flex gap-4 mr-2">
            <div className="text-right">
              <div className="text-sm font-semibold">{filtered.length}</div>
              <div className="text-[10px]">Groups</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold">{totalConsumers}</div>
              <div className="text-[10px]">Consumers</div>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center px-2.5 py-1.5 border border-slate-300 dark:border-slate-700 text-xs font-medium rounded-md text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search groups or topics..."
            className="w-72 pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>
        <div className="flex items-center gap-2 text-sm">
          <label className="text-slate-600 dark:text-slate-300">Sort</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy((e.target.value as 'members' | 'groupId' | 'state'))}
            className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800"
          >
            <option value="members">Members</option>
            <option value="groupId">Group ID</option>
            <option value="state">State</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="px-2 py-1 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800"
            title="Toggle sort direction"
          >
            {sortDir === 'asc' ? 'Asc' : 'Desc'}
          </button>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
          <label className="flex items-center gap-1">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded border-slate-300 dark:border-slate-700" />
            Auto-refresh
          </label>
          <label className="flex items-center gap-1">
            Every
            <select value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))} className="px-1.5 py-0.5 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800">
              <option value={3000}>3s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
            </select>
          </label>
          <button onClick={exportJSON} className="inline-flex items-center px-2 py-1 border border-slate-300 dark:border-slate-700 rounded-md">
            <Download className="w-3 h-3 mr-1" /> JSON
          </button>
          <button onClick={exportCSV} className="inline-flex items-center px-2 py-1 border border-slate-300 dark:border-slate-700 rounded-md">
            <Download className="w-3 h-3 mr-1" /> CSV
          </button>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 text-sm">
          {error}
        </div>
      ) : filtered.length === 0 && !loading ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Users className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Consumer Groups Found</h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            No matching consumer groups. Adjust filters or try refreshing.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-900/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Group</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Members</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">State</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Protocol</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 dark:text-slate-400">Subscriptions</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {filtered.map((group) => {
                  const isOpen = !!expanded[group.groupId];
                  return (
                    <tr key={group.groupId} className="align-top">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-md flex items-center justify-center">
                            <Users className="w-4 h-4 text-white" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-white truncate max-w-[280px]">{group.groupId}</div>
                            <div className="text-[11px] text-slate-500">Consumer Group</div>
                          </div>
                          <button
                            className="ml-1 px-2 py-1 text-xs border border-slate-300 dark:border-slate-700 rounded-md text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50"
                            title="Copy Group ID"
                            onClick={async () => { try { await navigator.clipboard.writeText(group.groupId); } catch {} }}
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`w-2 h-2 rounded-full mr-2 ${group.members > 0 ? 'bg-green-400' : 'bg-slate-300'}`}></div>
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{group.members}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getStateColor(group.state)}`}>{group.state}</span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-sm text-slate-900 dark:text-white font-mono">{group.protocol || 'N/A'}</span>
                      </td>
                      <td className="px-4 py-3">
                        {group.subscriptions.length > 0 ? (
                          <div className={`grid gap-1 ${isOpen ? 'grid-cols-1' : 'grid-cols-3'} max-w-3xl`}>
                            {(isOpen ? group.subscriptions : group.subscriptions.slice(0, 6)).map((topic, i) => (
                              <span key={i} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300 truncate">
                                {topic}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-slate-500 dark:text-slate-400">No subscriptions</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {group.subscriptions.length > 6 && (
                          <button
                            onClick={() => toggleExpand(group.groupId)}
                            className="inline-flex items-center px-2 py-1 border border-slate-300 dark:border-slate-700 rounded-md text-xs"
                          >
                            {isOpen ? (<><ChevronUp className="w-3 h-3 mr-1" /> Show less</>) : (<><ChevronDown className="w-3 h-3 mr-1" /> Show all</>)}
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
