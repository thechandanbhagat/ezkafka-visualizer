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
        return 'bg-emerald-950/30 text-emerald-400 border border-emerald-900';
      case 'rebalancing':
        return 'bg-amber-950/30 text-amber-400 border border-amber-900';
      case 'empty':
        return 'bg-zinc-900 text-zinc-400 border border-zinc-800';
      default:
        return 'bg-red-950/30 text-red-400 border border-red-900';
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
      <div className="h-16 px-5 dev-card flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Users className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-mono text-zinc-100 tracking-tight uppercase">Consumer Groups</h1>
            <p className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Monitor membership and subscriptions</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          <div className="hidden md:flex gap-5 mr-2">
            <div className="text-right">
              <div className="text-xl font-bold font-mono text-emerald-400 leading-none">{filtered.length}</div>
              <div className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest mt-1">GROUPS</div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold font-mono text-emerald-400 leading-none">{totalConsumers}</div>
              <div className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest mt-1">CONSUMERS</div>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="dev-btn inline-flex items-center"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
            REFRESH
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 px-1">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-zinc-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search groups or topics..."
            className="w-72 pl-10 pr-4 dev-input py-2"
          />
        </div>
        <div className="flex items-center gap-2 bg-black border border-zinc-800 p-1">
          <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest px-2">SORT</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy((e.target.value as 'members' | 'groupId' | 'state'))}
            className="px-2 py-1 bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono text-xs focus:outline-none focus:border-emerald-500 rounded-none uppercase tracking-widest"
          >
            <option value="members">MEMBERS</option>
            <option value="groupId">GROUP_ID</option>
            <option value="state">STATE</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
            className="dev-btn py-1 px-3 text-xs"
            title="Toggle sort direction"
          >
            {sortDir === 'asc' ? 'ASC' : 'DESC'}
          </button>
        </div>
        <div className="ml-auto flex items-center gap-4 text-xs font-mono font-bold text-zinc-500 uppercase tracking-widest">
          <label className="flex items-center gap-2 cursor-pointer hover:text-emerald-400 transition-colors">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="rounded-none bg-zinc-950 border-zinc-800 text-emerald-500 focus:ring-emerald-500 focus:ring-1 focus:ring-offset-0 focus:ring-offset-black" />
            AUTO_REFRESH
          </label>
          <div className="flex items-center gap-2 bg-black border border-zinc-800 p-1">
            <span className="pl-2 text-[10px] uppercase tracking-widest">EVERY</span>
            <select value={intervalMs} onChange={(e) => setIntervalMs(Number(e.target.value))} className="px-2 py-1 bg-zinc-950 border border-zinc-800 text-zinc-300 font-mono text-xs focus:outline-none focus:border-emerald-500 rounded-none uppercase tracking-widest">
              <option value={3000}>3s</option>
              <option value={5000}>5s</option>
              <option value={10000}>10s</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={exportJSON} className="dev-btn py-1.5 px-3 flex items-center text-xs">
              <Download className="w-3 h-3 mr-1.5" /> JSON
            </button>
            <button onClick={exportCSV} className="dev-btn py-1.5 px-3 flex items-center text-xs">
              <Download className="w-3 h-3 mr-1.5" /> CSV
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      {error ? (
        <div className="bg-red-950/30 border border-red-900 p-4 text-xs font-mono font-bold text-red-400 uppercase tracking-widest">
          ERR: {error}
        </div>
      ) : filtered.length === 0 && !loading ? (
        <div className="text-center py-16 dev-card">
          <div className="w-24 h-24 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-zinc-600" />
          </div>
          <h3 className="text-sm font-mono font-bold text-zinc-300 mb-2 uppercase tracking-widest">NO_GROUPS_FOUND</h3>
          <p className="text-xs font-mono text-zinc-500 max-w-md mx-auto uppercase tracking-widest">
            NO MATCHING CONSUMER GROUPS.
          </p>
        </div>
      ) : (
        <div className="dev-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-800">
              <thead className="bg-zinc-950">
                <tr>
                  <th className="px-5 py-4 text-left text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest">GROUP_ID</th>
                  <th className="px-5 py-4 text-left text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest">MEMBERS</th>
                  <th className="px-5 py-4 text-left text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest">STATE</th>
                  <th className="px-5 py-4 text-left text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest">PROTOCOL</th>
                  <th className="px-5 py-4 text-left text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest">SUBSCRIPTIONS</th>
                  <th className="px-5 py-4"></th>
                </tr>
              </thead>
              <tbody className="bg-black divide-y divide-zinc-900">
                {filtered.map((group) => {
                  const isOpen = !!expanded[group.groupId];
                  return (
                    <tr key={group.groupId} className="align-top hover:bg-zinc-900/50 transition-colors group/row">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-4">
                          <div className="w-8 h-8 bg-zinc-950 border border-zinc-800 flex items-center justify-center group-hover/row:border-emerald-500/50 transition-colors">
                            <Users className="w-4 h-4 text-emerald-500/70" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold font-mono text-zinc-100 truncate max-w-[280px] tracking-tight">{group.groupId}</div>
                            <div className="text-[10px] font-mono text-zinc-600 mt-0.5 uppercase tracking-widest">GROUP_OBJ</div>
                          </div>
                          <button
                            className="ml-2 p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-900 rounded-none opacity-0 group-hover/row:opacity-100 transition-all focus:outline-none"
                            title="Copy Group ID"
                            onClick={async () => { try { await navigator.clipboard.writeText(group.groupId); } catch {} }}
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center mt-1.5">
                          <div className={`w-2 h-2 mr-2.5 shadow-[0_0_8px_rgba(16,185,129,0.5)] ${group.members > 0 ? 'bg-emerald-500' : 'bg-zinc-700 shadow-none'}`}></div>
                          <span className="text-sm font-bold font-mono text-zinc-300">{group.members}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="mt-1">
                          <span className={`dev-badge ${getStateColor(group.state)}`}>{group.state}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="mt-1.5 text-sm text-zinc-400 font-mono font-bold uppercase">{group.protocol || 'N/A'}</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="mt-1">
                          {group.subscriptions.length > 0 ? (
                            <div className={`grid gap-1.5 ${isOpen ? 'grid-cols-1' : 'grid-cols-3'} max-w-3xl`}>
                              {(isOpen ? group.subscriptions : group.subscriptions.slice(0, 6)).map((topic, i) => (
                                <span key={i} className="dev-badge bg-zinc-950 border-zinc-800 text-zinc-300 truncate">
                                  {topic}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-xs font-mono font-bold text-zinc-600 uppercase tracking-widest">NO_SUBSCRIPTIONS</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap">
                        <div className="mt-1">
                          {group.subscriptions.length > 6 && (
                            <button
                              onClick={() => toggleExpand(group.groupId)}
                              className="dev-btn py-1 px-2 text-[10px] inline-flex items-center"
                            >
                              {isOpen ? (<><ChevronUp className="w-3.5 h-3.5 mr-1" /> LESS</>) : (<><ChevronDown className="w-3.5 h-3.5 mr-1" /> ALL</>)}
                            </button>
                          )}
                        </div>
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
