"use client";

// @group Configuration > Imports : React, icons, and Kafka context
import { useState, useEffect, useRef, Fragment } from 'react';
import {
  Plus,
  Trash2,
  RefreshCw,
  Database,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Edit3,
  X,
  Eraser,
  Search,
  Unplug,
} from "lucide-react";
import type { TopicInfo } from '@/lib/kafka';
import { useServer } from '@/contexts/ServerContext';

// @group Types : Topic workspace properties
interface TopicListProps {
  topics: TopicInfo[];
  loading: boolean;
  onRefresh: (profileId?: string) => void;
  onOpenSettings: () => void;
  onExploreTopic: (topic: string) => void;
  connectionError?: string | null;
}

export default function TopicList({ topics, loading, onRefresh, onOpenSettings, onExploreTopic, connectionError }: TopicListProps) {
  // @group Configuration > State : Topic actions, filters, and configuration editor
  const { selectedProfileId, activeProfile } = useServer();
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');
  const [newTopicPartitions, setNewTopicPartitions] = useState(1);
  const [creating, setCreating] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [topicConfigs, setTopicConfigs] = useState<Record<string, Record<string, string>>>({});
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);
  const [configEditorLoading, setConfigEditorLoading] = useState(false);
  const [configEditorError, setConfigEditorError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cleaningAll, setCleaningAll] = useState(false);
  const [cleaningTopic, setCleaningTopic] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [configErrors, setConfigErrors] = useState<Record<string, string>>({});
  const configDialogRef = useRef<HTMLDivElement>(null);
  const nf = new Intl.NumberFormat();

  // @group Constants : Plain-language descriptions for Kafka configuration keys
  const CONFIG_DESCRIPTIONS: Record<string, string> = {
    'cleanup.policy': 'How Kafka cleans up old data. "delete" removes old messages; "compact" keeps the latest value per key.',
    'delete.retention.ms': 'How long Kafka keeps deleted records (tombstones) before cleaning them up.',
    'retention.ms': 'How long to keep messages in the topic before they are eligible for deletion. -1 means keep forever.',
    'retention.bytes': 'Maximum total size of data per partition before Kafka starts deleting old messages. -1 means no size limit.',
    'segment.bytes': 'Approx size of each log segment file. Smaller segments roll more often; larger segments roll less often.',
    'segment.ms': 'Max time before a new log segment is rolled even if size not reached.',
    'min.insync.replicas': 'Minimum number of replicas that must acknowledge a write to consider it successful (when acks=all).',
    'compression.type': 'How messages are compressed on the broker. Can reduce storage and bandwidth at the cost of CPU.',
    'max.message.bytes': 'Largest allowed message size that can be written to this topic.',
    'message.timestamp.type': 'Whether to use the time the message was created (CreateTime) or when it was appended to the log (LogAppendTime).',
    'message.format.version': 'Internal message format version used by the topic. Typically set by the broker version.',
    'index.interval.bytes': 'How frequently Kafka adds an index entry for quick lookups. Smaller values can speed lookups but use more space.',
    'segment.index.bytes': 'Maximum size of the segment index file. Larger allows indexing more entries per segment.',
    'unclean.leader.election.enable': 'If true, Kafka can choose an out-of-sync replica as leader during failures (risking data loss).',
    'min.cleanable.dirty.ratio': 'Controls how aggressively log compaction runs. Lower values compact more frequently.',
    'flush.ms': 'How often to force flush data to disk regardless of other settings. Very low values can impact performance.',
    'flush.messages': 'How many messages to accumulate before forcing a flush to disk. Very low values can impact performance.',
  };

  // @group Utilities : Configuration descriptions and modal keyboard navigation
  useEffect(() => {
    if (!showConfigEditor) return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    configDialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowConfigEditor(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = configDialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex="0"]');
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === configDialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus?.focus();
    };
  }, [showConfigEditor]);

  const getConfigTooltip = (key: string): string => {
    // Exact match first
    if (CONFIG_DESCRIPTIONS[key]) return CONFIG_DESCRIPTIONS[key];
    // Heuristics for families of settings
    if (key.endsWith('.replicas')) return 'Controls which replicas are throttled or required for certain operations.';
    if (key.endsWith('.lag.ms')) return 'How long Kafka can wait before compacting or considering data stale.';
    if (key.endsWith('.delay.ms')) return 'A delay (in milliseconds) applied to this operation or lifecycle step.';
    if (key.endsWith('.bytes')) return 'Size limit in bytes. Larger values allow more data before rolling or deleting.';
    if (key.endsWith('.ms')) return 'Time in milliseconds. Increase or decrease to change timing behavior.';
    return 'Kafka topic setting. Adjust with care as it affects storage, performance, or durability.';
  };

  // @group APIEndpoints > Configuration : Read, expand, and edit topic settings
  const topicUrl = (topicName: string, action = '') => `/api/topics/${encodeURIComponent(topicName)}${action}?profileId=${encodeURIComponent(selectedProfileId)}`;

  const requireSuccess = async (response: Response, fallback: string) => {
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || fallback);
    }
  };

  const fetchTopicConfig = async (topicName: string) => {
    try {
      const response = await fetch(topicUrl(topicName, '/config'));
      await requireSuccess(response, 'Unable to load topic configuration.');
      const config = await response.json() as Record<string, string>;
      setTopicConfigs(prev => ({ ...prev, [topicName]: config }));
      setConfigErrors(prev => ({ ...prev, [topicName]: '' }));
      return config;
    } catch (error) {
      setConfigErrors(prev => ({ ...prev, [topicName]: error instanceof Error ? error.message : 'Unable to load configuration.' }));
      throw error;
    }
  };

  const openConfigEditor = async (topicName: string) => {
    setSelectedTopic(topicName);
    setShowConfigEditor(true);
    setConfigEditorError(null);

    setEditingConfig({});
    setConfigEditorLoading(true);
    try {
      const config = await fetchTopicConfig(topicName);
      setEditingConfig(config || {});
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load configuration';
      setConfigEditorError(message);
      setEditingConfig({});
    } finally {
      setConfigEditorLoading(false);
    }
  };

  const toggleTopic = async (topicName: string) => {
    const next = new Set(expandedTopics);
    if (next.has(topicName)) {
      next.delete(topicName);
    } else {
      next.add(topicName);
      if (!topicConfigs[topicName]) {
        await fetchTopicConfig(topicName).catch(() => undefined);
      }
    }
    setExpandedTopics(next);
  };

  const updateTopicConfig = async (topicName: string, configs: Record<string, string>) => {
    setSavingConfig(true);
    setConfigEditorError(null);
    try {
      const changes = Object.fromEntries(Object.entries(configs).filter(([key, value]) => topicConfigs[topicName]?.[key] !== value));
      if (!Object.keys(changes).length) { setShowConfigEditor(false); return; }
      const response = await fetch(topicUrl(topicName, '/config'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs: changes }),
      });
      if (response.ok) {
        await fetchTopicConfig(topicName);
        setShowConfigEditor(false);
        setSelectedTopic(null);
      } else {
        const error = await response.json();
        setConfigEditorError(error.error || 'Unable to update configuration.');
      }
    } catch (error) {
      setConfigEditorError(error instanceof Error ? error.message : 'Unable to update configuration.');
    } finally {
      setSavingConfig(false);
    }
  };

  // @group APIEndpoints > Topics : Create topics and manage partitions and messages
  const addPartitions = async (topicName: string, newPartitionCount: number) => {
    const currentCount = topics.find(topic => topic.name === topicName)?.partitions ?? 0;
    if (!Number.isSafeInteger(newPartitionCount) || newPartitionCount <= currentCount) {
      setActionError(`Partition count must be a whole number greater than ${currentCount}.`);
      return;
    }
    setActionError(null);
    try {
      const response = await fetch(topicUrl(topicName, '/partitions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: newPartitionCount }),
      });
      if (response.ok) {
        onRefresh(selectedProfileId);
      } else {
        const error = await response.json();
        setActionError(error.error || 'Unable to add partitions.');
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to add partitions.');
    }
  };

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;

    setCreating(true);
    setActionError(null);
    try {
      const response = await fetch('/api/topics', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newTopicName,
          partitions: newTopicPartitions,
          replicationFactor: 1,
          profileId: selectedProfileId,
        }),
      });

      await requireSuccess(response, 'Unable to create topic.');

      setNewTopicName('');
      setNewTopicPartitions(1);
      setShowCreateForm(false);
      onRefresh(selectedProfileId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to create topic.');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTopic = async (topicName: string) => {
    if (!confirm(`Delete topic "${topicName}" and all its data from "${activeProfile?.name}"? This cannot be undone.`)) {
      return;
    }

    setActionError(null);
    try {
      const response = await fetch(topicUrl(topicName), {
        method: 'DELETE',
      });

      await requireSuccess(response, 'Unable to delete topic.');

      onRefresh(selectedProfileId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to delete topic.');
    }
  };

  const handleCleanupMessages = async (topicName: string) => {
    if (cleaningAll || cleaningTopic || !confirm(`Purge retained messages from "${topicName}" on "${activeProfile?.name}"? This cannot be undone. The topic and its configuration will be preserved.`)) return;
    setCleaningTopic(topicName);
    setActionError(null);
    try {
      const response = await fetch(topicUrl(topicName, '/cleanup'), {
        method: 'POST',
      });

      await requireSuccess(response, 'Unable to purge messages.');
      onRefresh(selectedProfileId);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to purge messages.');
    } finally {
      setCleaningTopic(null);
    }
  };

  const handleCleanupAllTopics = async () => {
    const userTopics = topics.filter(topic => !topic.name.startsWith('__') && topic.messageCount !== 0);
    if (cleaningAll || cleaningTopic || !confirm(`Purge retained messages from ${userTopics.length} non-internal topics on "${activeProfile?.name}"? This cannot be undone. Topic configurations will be preserved.`)) {
      return;
    }

    setCleaningAll(true);
    setActionError(null);
    const failures: string[] = [];
    try {
      for (const topic of userTopics) {
        try {
          const response = await fetch(topicUrl(topic.name, '/cleanup'), {
            method: 'POST',
          });
          await requireSuccess(response, 'Unable to purge messages.');
        } catch (error) {
          failures.push(`${topic.name}: ${error instanceof Error ? error.message : 'Unable to purge messages.'}`);
        }
      }
      onRefresh(selectedProfileId);
      if (failures.length) setActionError(`${userTopics.length - failures.length} of ${userTopics.length} topics purged. Failed: ${failures.join('; ')}`);
    } finally {
      setCleaningAll(false);
    }
  };

  // @group BusinessLogic > Summary : Derive visible topics and counts from the current response
  const filteredTopics = topics.filter(topic =>
    topic.name.toLowerCase().includes(searchQuery.toLowerCase())
  );
  const hasSnapshot = !connectionError && !(loading && topics.length === 0);
  const partitionCount = topics.reduce((total, topic) => total + topic.partitions, 0);
  const hasMessageCounts = topics.every(topic => typeof topic.messageCount === 'number');
  const messageCount = topics.reduce((total, topic) => total + (topic.messageCount || 0), 0);

  // @group Components > TopicWorkspace : Page heading, overview, and topic controls
  return (
    <div className="min-w-0 space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-5 gap-y-2">
          <h1 className="text-xl font-semibold tracking-tight text-ink">Topics</h1>
          <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <div className="flex flex-row-reverse items-baseline gap-1.5">
              <dt>topics</dt>
              <dd className="font-semibold tabular-nums text-ink">{hasSnapshot ? nf.format(topics.length) : '—'}</dd>
            </div>
            <div className="flex flex-row-reverse items-baseline gap-1.5">
              <dt>partitions</dt>
              <dd className="font-semibold tabular-nums text-ink">{hasSnapshot ? nf.format(partitionCount) : '—'}</dd>
            </div>
            <div className="flex flex-row-reverse items-baseline gap-1.5">
              <dt>estimated messages</dt>
              <dd className="font-semibold tabular-nums text-ink">{hasSnapshot && hasMessageCounts ? nf.format(messageCount) : '—'}</dd>
            </div>
          </dl>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="dev-btn-primary inline-flex items-center gap-2 whitespace-nowrap"
          aria-expanded={showCreateForm}
          aria-controls="create-topic-form"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Create topic
        </button>
      </header>

      {actionError && <div role="alert" className="rounded-md border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{actionError}</div>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search topics..."
            aria-label="Search topics"
            className="dev-input w-full !pl-8"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onRefresh(selectedProfileId)}
            disabled={loading}
            className="dev-btn inline-flex items-center gap-2 whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
          <button
            onClick={handleCleanupAllTopics}
            disabled={cleaningAll || Boolean(cleaningTopic) || topics.length === 0}
            className="dev-btn inline-flex items-center gap-2 whitespace-nowrap hover:!border-warning hover:!text-warning disabled:cursor-not-allowed disabled:opacity-50"
            title="Purge messages from all topics"
          >
            <Eraser className={`h-4 w-4 ${cleaningAll ? 'animate-pulse' : ''}`} aria-hidden="true" />
            {cleaningAll ? 'Purging...' : 'Purge all messages'}
          </button>
        </div>
      </div>

      {/* @group Components > CreateTopic : Topic creation form */}
      {showCreateForm && (
        <section id="create-topic-form" aria-labelledby="create-topic-heading" className="dev-card p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 id="create-topic-heading" className="text-base font-semibold text-ink">Create a topic</h2>
            </div>
            <button onClick={() => setShowCreateForm(false)} aria-label="Close create topic form" className="rounded-md p-1.5 text-muted transition-colors hover:bg-subtle hover:text-ink">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <form onSubmit={handleCreateTopic} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <label htmlFor="new-topic-name" className="block text-sm font-medium text-ink">Topic name</label>
                <input id="new-topic-name" type="text" value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} placeholder="e.g. orders.created" className="dev-input w-full font-mono" required />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="new-topic-partitions" className="block text-sm font-medium text-ink">Partitions</label>
                <input id="new-topic-partitions" type="number" value={newTopicPartitions} onChange={(e) => setNewTopicPartitions(parseInt(e.target.value) || 1)} min="1" className="dev-input w-full" />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <button type="button" onClick={() => setShowCreateForm(false)} className="dev-btn">Cancel</button>
              <button type="submit" disabled={creating} className="dev-btn-primary disabled:cursor-not-allowed disabled:opacity-50">{creating ? 'Creating...' : 'Create topic'}</button>
            </div>
          </form>
        </section>
      )}

      {/* @group Components > TopicData : Loading, connection, empty, and populated topic states */}
      {loading && topics.length === 0 ? (
        <div className="dev-card overflow-hidden" role="status" aria-label="Loading topics">
          <div className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm text-muted">
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading topics from your cluster...
          </div>
          <div className="divide-y divide-line" aria-hidden="true">
            {[0, 1, 2, 3].map(row => (
              <div key={row} className="flex h-11 items-center gap-8 px-3 motion-safe:animate-pulse">
                <div className="h-3 w-1/3 rounded bg-subtle" />
                <div className="h-3 w-12 rounded bg-subtle" />
                <div className="h-3 w-20 rounded bg-subtle" />
              </div>
            ))}
          </div>
        </div>
      ) : connectionError && topics.length === 0 ? (
        <div className="dev-card px-4 py-8 text-center" role="status">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-subtle text-muted"><Unplug className="h-5 w-5" aria-hidden="true" /></div>
          <h2 className="text-base font-semibold text-ink">Unable to load topics</h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">We could not connect to this Kafka cluster. Check the broker connection in Settings, then try again.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button onClick={() => onRefresh(selectedProfileId)} className="dev-btn-primary inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" aria-hidden="true" /> Retry connection</button>
            <button onClick={onOpenSettings} className="dev-btn">Open settings</button>
          </div>
        </div>
      ) : topics.length === 0 ? (
        <div className="dev-card px-4 py-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-accent-soft text-accent"><Database className="h-5 w-5" aria-hidden="true" /></div>
          <h2 className="text-base font-semibold text-ink">Your first stream starts here</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted">This cluster has no topics yet. Create a topic to start producing and consuming messages.</p>
          <button onClick={() => setShowCreateForm(true)} className="dev-btn-primary mt-4 inline-flex items-center gap-2"><Plus className="h-4 w-4" aria-hidden="true" /> Create topic</button>
        </div>
      ) : (
        <div className="dev-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[680px] w-full divide-y divide-line text-sm" aria-label="Kafka topics" aria-busy={loading}>
              <thead className="bg-subtle">
                <tr>
                  {['Topic name', 'Partitions', 'Replication', 'Est. messages', 'Consumers'].map(label => (
                    <th key={label} scope="col" className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium text-muted">{label}</th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line bg-surface">
                {filteredTopics.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center">
                      <Search className="mx-auto mb-3 h-6 w-6 text-muted" aria-hidden="true" />
                      <p className="font-medium text-ink">No topics match your search</p>
                      <p className="mt-1 text-sm text-muted">Try a different topic name or clear the filter.</p>
                      <button onClick={() => setSearchQuery('')} className="dev-btn mt-4">Clear search</button>
                    </td>
                  </tr>
                ) : filteredTopics.map((topic) => (
                  <Fragment key={topic.name}>
                    <tr className="transition-colors hover:bg-subtle/60">
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => toggleTopic(topic.name)}
                            className="shrink-0 rounded-md p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent"
                            aria-label={`${expandedTopics.has(topic.name) ? 'Collapse' : 'Expand'} configuration for ${topic.name}`}
                            aria-expanded={expandedTopics.has(topic.name)}
                            aria-controls={`topic-config-details-${topic.name}`}
                          >
                            {expandedTopics.has(topic.name) ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                          </button>
                          <span className="max-w-[240px] truncate font-mono text-[13px] font-medium text-ink" title={topic.name}>{topic.name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[13px] tabular-nums text-ink">{topic.partitions}</td>
                      <td className="px-3 py-1.5 font-mono text-[13px] tabular-nums text-ink">{topic.replicationFactor}</td>
                      <td className="px-3 py-1.5 font-mono text-[13px] tabular-nums text-ink">{typeof topic.messageCount === 'number' ? nf.format(topic.messageCount) : '—'}</td>
                      <td className="whitespace-nowrap px-3 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${(topic.connectedConsumers || 0) > 0 ? 'bg-success' : 'bg-line'}`} aria-hidden="true" />
                          <span className="font-mono text-[13px] tabular-nums text-ink">{topic.connectedConsumers || 0}</span>
                          {topic.consumerGroups && topic.consumerGroups.length > 0 && (
                            <span className="dev-badge ml-1 whitespace-nowrap" title={`Consumer groups: ${topic.consumerGroups.join(', ')}`}>{topic.consumerGroups.length} {topic.consumerGroups.length === 1 ? 'group' : 'groups'}</span>
                          )}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right">
                        <button onClick={() => onExploreTopic(topic.name)} className="rounded-md p-2 text-muted transition-colors hover:bg-accent-soft hover:text-accent" title="Browse messages" aria-label={`Browse messages in ${topic.name}`}><Search className="h-4 w-4" aria-hidden="true" /></button>
                      </td>
                    </tr>
                    {expandedTopics.has(topic.name) && (
                      <tr id={`topic-config-details-${topic.name}`}>
                        <td colSpan={6} className="border-y border-line bg-subtle px-3 py-3">
                          <div role="group" className="mb-3 flex flex-wrap items-center gap-2" aria-label={`Actions for ${topic.name}`}>
                            <button onClick={() => openConfigEditor(topic.name)} className="dev-btn inline-flex items-center gap-1.5" aria-label={`Edit configuration for ${topic.name}`}><Edit3 className="h-3.5 w-3.5" aria-hidden="true" /> Edit configuration</button>
                            <button
                              onClick={() => {
                                const newCount = prompt(`Enter new partition count for ${topic.name} (can only increase):`);
                                if (newCount !== null) addPartitions(topic.name, Number(newCount));
                              }}
                              className="dev-btn inline-flex items-center gap-1.5" aria-label={`Add partitions to ${topic.name}`}
                            ><BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> Add partitions</button>
                            <button onClick={() => handleCleanupMessages(topic.name)} className="dev-btn inline-flex items-center gap-1.5 hover:!border-warning hover:!text-warning disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Purge messages from ${topic.name}`} disabled={cleaningAll || Boolean(cleaningTopic) || topic.messageCount === 0}><Eraser className="h-3.5 w-3.5" aria-hidden="true" /> {cleaningTopic === topic.name ? 'Purging...' : 'Purge messages'}</button>
                            <button onClick={() => handleDeleteTopic(topic.name)} className="dev-btn inline-flex items-center gap-1.5 hover:!border-danger hover:!text-danger" aria-label={`Delete topic ${topic.name}`}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Delete topic</button>
                          </div>
                          <h3 className="mb-2 text-sm font-semibold text-ink">Topic configuration</h3>
                          {configErrors[topic.name] ? <p className="text-sm text-danger" role="alert">{configErrors[topic.name]}</p> : !topicConfigs[topic.name] ? <p className="text-sm text-muted" role="status">Loading configuration...</p> : Object.keys(topicConfigs[topic.name]).length === 0 ? <p className="text-sm text-muted">No configuration properties are available.</p> : (
                            <dl className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2 xl:grid-cols-3">
                              {Object.entries(topicConfigs[topic.name]).map(([key, value]) => (
                                <div key={key} className="min-w-0 border-b border-line py-1.5">
                                  <dt className="mb-0.5 truncate font-mono text-xs text-muted" title={getConfigTooltip(key)}>{key}</dt>
                                  <dd className="truncate font-mono text-xs font-medium text-ink" title={value || 'default'}>{value || 'default'}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-3 py-2 text-xs text-muted" aria-live="polite">Showing {nf.format(filteredTopics.length)} of {nf.format(topics.length)} topics</div>
        </div>
      )}

      {/* @group Components > ConfigurationEditor : Accessible topic settings dialog */}
      {showConfigEditor && selectedTopic && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/35 p-4">
          <div ref={configDialogRef} role="dialog" aria-modal="true" aria-labelledby="config-editor-heading" tabIndex={-1} className="dev-card flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden outline-none">
            <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
              <div className="min-w-0">
                <h2 id="config-editor-heading" className="text-lg font-semibold text-ink">Edit topic configuration</h2>
                <p className="mt-1 break-all font-mono text-xs text-muted">{selectedTopic}</p>
              </div>
              <button onClick={() => setShowConfigEditor(false)} aria-label="Close configuration editor" className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-subtle hover:text-ink"><X className="h-5 w-5" aria-hidden="true" /></button>
            </div>
            <div className="min-h-0 overflow-y-auto bg-surface p-4">
              {configEditorLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted" role="status"><RefreshCw className="mb-3 h-6 w-6 animate-spin text-accent" aria-hidden="true" /><span className="text-sm">Loading configuration...</span></div>
              ) : configEditorError ? (
                <div className="rounded-md border border-danger/20 bg-danger/5 p-4 text-sm text-danger" role="alert">{configEditorError}</div>
              ) : Object.keys(editingConfig).length > 0 ? (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {Object.entries(editingConfig).map(([key, value]) => (
                    <div key={key} className="space-y-2">
                      <label htmlFor={`edit-topic-config-${key}`} className="block break-all font-mono text-xs font-medium text-ink" title={getConfigTooltip(key)}>{key}</label>
                      <input id={`edit-topic-config-${key}`} type="text" value={value || ''} onChange={(e) => setEditingConfig({ ...editingConfig, [key]: e.target.value })} className="dev-input w-full font-mono" aria-describedby={`edit-topic-help-${key}`} />
                      <p id={`edit-topic-help-${key}`} className="text-xs leading-5 text-muted">{getConfigTooltip(key)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-subtle p-4 text-sm text-muted"><span>No configuration properties are available.</span><button onClick={() => selectedTopic && openConfigEditor(selectedTopic)} className="dev-btn">Retry</button></div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-line bg-subtle px-4 py-3">
              <button onClick={() => setShowConfigEditor(false)} className="dev-btn">Cancel</button>
              <button onClick={() => selectedTopic && updateTopicConfig(selectedTopic, editingConfig)} disabled={savingConfig || configEditorLoading || Object.keys(editingConfig).length === 0} className="dev-btn-primary disabled:cursor-not-allowed disabled:opacity-50">{savingConfig ? 'Saving...' : 'Save changes'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
