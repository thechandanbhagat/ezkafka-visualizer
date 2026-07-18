"use client";

import { useState, Fragment } from 'react';
import {
  Plus,
  Trash2,
  RefreshCw,
  Database,
  BarChart3,
  Users,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Edit3,
  X,
  Eraser,
  Search,
} from "lucide-react";
import { TopicInfo } from '@/lib/kafka';
import { useActiveProfileId } from '@/contexts/ServerContext';

interface TopicListProps {
  topics: TopicInfo[];
  loading: boolean;
  onRefresh: (profileId?: string) => void;
}

export default function TopicList({ topics, loading, onRefresh }: TopicListProps) {
  const selectedProfileId = useActiveProfileId();
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
  const nf = new Intl.NumberFormat();

  // Layman-friendly descriptions for common Kafka topic configuration keys
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

  const fetchTopicConfig = async (topicName: string) => {
    try {
      const response = await fetch(`/api/topics/${topicName}/config`);
      if (response.ok) {
        const config = await response.json();
        setTopicConfigs((prev) => ({ ...prev, [topicName]: config }));
        return config as Record<string, string>;
      }
    } catch (error) {
      console.error('Failed to fetch topic config:', error);
    }
    return {} as Record<string, string>;
  };

  const openConfigEditor = async (topicName: string) => {
    setSelectedTopic(topicName);
    setShowConfigEditor(true);
    setConfigEditorError(null);

    // If already cached, use immediately
    if (topicConfigs[topicName]) {
      setEditingConfig(topicConfigs[topicName]);
      return;
    }

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
        await fetchTopicConfig(topicName);
      }
    }
    setExpandedTopics(next);
  };

  const updateTopicConfig = async (topicName: string, configs: Record<string, string>) => {
    setSavingConfig(true);
    try {
      const response = await fetch(`/api/topics/${topicName}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs }),
      });
      if (response.ok) {
        await fetchTopicConfig(topicName);
        setShowConfigEditor(false);
        setSelectedTopic(null);
      } else {
        const error = await response.json();
        alert(`Failed to update configuration: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`Error updating configuration: ${error}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const addPartitions = async (topicName: string, newPartitionCount: number) => {
    if (newPartitionCount <= 0) return;
    try {
      const response = await fetch(`/api/topics/${topicName}/partitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partitions: newPartitionCount }),
      });
      if (response.ok) {
        onRefresh();
        alert(`Successfully added partitions to ${topicName}`);
      } else {
        const error = await response.json();
        alert(`Failed to add partitions: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      alert(`Error adding partitions: ${error}`);
    }
  };

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopicName.trim()) return;

    setCreating(true);
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

      if (!response.ok) {
        throw new Error('Failed to create topic');
      }

      setNewTopicName('');
      setNewTopicPartitions(1);
      setShowCreateForm(false);
      onRefresh();
    } catch (error) {
      console.error('Error creating topic:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteTopic = async (topicName: string) => {
    if (!confirm(`Are you sure you want to delete topic "${topicName}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/topics/${topicName}?profileId=${encodeURIComponent(selectedProfileId || '')}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete topic');
      }

      onRefresh(selectedProfileId);
    } catch (error) {
      console.error('Error deleting topic:', error);
    }
  };

  const handleCleanupMessages = async (topicName: string, messageCount?: number) => {
    try {
      const response = await fetch(`/api/topics/${topicName}/cleanup?profileId=${encodeURIComponent(selectedProfileId || '')}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to cleanup messages');
      }

      // Success is visual when the topic count drops to 0 via refresh
      onRefresh(selectedProfileId);
    } catch (error) {
      console.error('Error cleaning up messages:', error);
      alert(`Error cleaning up messages: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const handleCleanupAllTopics = async () => {
    if (!confirm('Are you sure you want to purge all messages from ALL topics? This action cannot be undone and may take some time depending on the number of topics.')) {
      return;
    }

    setCleaningAll(true);
    try {
      // Filter out internal topics like __consumer_offsets
      const userTopics = topics.filter(t => !t.name.startsWith('_'));
      for (const topic of userTopics) {
        // Only clean if there's potentially something to clean or we don't know the count
        if (topic.messageCount !== 0) {
          await fetch(`/api/topics/${encodeURIComponent(topic.name)}/cleanup?profileId=${encodeURIComponent(selectedProfileId || '')}`, {
            method: 'POST',
          });
        }
      }
      onRefresh(selectedProfileId);
    } catch (error) {
      console.error('Error cleaning up all topics:', error);
      alert('An error occurred while cleaning up topics. Please refresh and try again.');
    } finally {
      setCleaningAll(false);
    }
  };

  const filteredTopics = topics.filter(topic =>
    topic.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="h-16 px-5 dev-card flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Database className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-mono text-zinc-100 tracking-tight">KAFKA_TOPICS</h1>
            <p className="text-xs font-mono text-zinc-500 uppercase">Manage topics and partitions</p>
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <div className="text-xl font-bold font-mono text-emerald-400 leading-none">{topics.length}</div>
          <div className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest mt-1">TOTAL_TOPICS</div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex justify-between items-center px-1">
        <div className="flex items-center space-x-3 flex-1">
          <button
            onClick={() => onRefresh(selectedProfileId)}
            disabled={loading}
            className="dev-btn inline-flex items-center whitespace-nowrap"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin text-emerald-500' : ''}`} />
            REFRESH
          </button>
          <div className="relative max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="SEARCH_TOPICS..."
              className="w-full !pl-10 pr-4 dev-input py-2"
            />
          </div>
        </div>
        <div className="flex items-center space-x-3 ml-4">
          <button
            onClick={handleCleanupAllTopics}
            disabled={cleaningAll || topics.length === 0}
            className="dev-btn inline-flex items-center whitespace-nowrap !text-amber-500 hover:!text-amber-400 hover:!border-amber-500"
            title="Purge messages from all topics"
          >
            <Eraser className={`w-4 h-4 mr-2 ${cleaningAll ? 'animate-pulse' : ''}`} />
            {cleaningAll ? 'PURGING...' : 'PURGE_ALL'}
          </button>
          <button
            onClick={() => setShowCreateForm(true)}
            className="dev-btn-primary inline-flex items-center whitespace-nowrap"
          >
            <Plus className="w-4 h-4 mr-2" />
            CREATE_TOPIC
          </button>
        </div>
      </div>

      {/* Create Topic Form */}
      {showCreateForm && (
        <div className="dev-card p-5 animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="flex items-center justify-between mb-5 border-b border-zinc-800 pb-3">
            <h3 className="text-sm font-bold font-mono text-zinc-100 uppercase tracking-widest">Create New Topic</h3>
            <button
              onClick={() => setShowCreateForm(false)}
              className="p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-900 transition-colors rounded-none focus:outline-none"
            >
              <Plus className="w-5 h-5 rotate-45" />
            </button>
          </div>
          
          <form onSubmit={handleCreateTopic} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                  Topic Name
                </label>
                <input
                  type="text"
                  value={newTopicName}
                  onChange={(e) => setNewTopicName(e.target.value)}
                  placeholder="Enter topic name"
                  className="w-full dev-input"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-mono font-bold text-zinc-400 uppercase tracking-wider">
                  Partitions
                </label>
                <input
                  type="number"
                  value={newTopicPartitions}
                  onChange={(e) => setNewTopicPartitions(parseInt(e.target.value) || 1)}
                  min="1"
                  className="w-full dev-input"
                />
              </div>
            </div>
            
            <div className="flex justify-end space-x-3 pt-4 border-t border-zinc-800 mt-6">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="dev-btn"
              >
                CANCEL
              </button>
              <button
                type="submit"
                disabled={creating}
                className="dev-btn-primary disabled:opacity-50"
              >
                {creating ? 'CREATING...' : 'CREATE_TOPIC'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Topics List */}
      {loading && topics.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
            <div className="animate-spin w-8 h-8 border-2 border-zinc-800 border-t-emerald-500 rounded-none"></div>
          </div>
          <p className="text-sm font-mono font-bold text-zinc-500 uppercase tracking-widest">Loading topics...</p>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-16 dev-card">
          <div className="w-24 h-24 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6">
            <Database className="w-10 h-10 text-zinc-600" />
          </div>
          <h3 className="text-sm font-mono font-bold text-zinc-300 mb-2 uppercase tracking-widest">No Topics Found</h3>
          <p className="text-xs font-mono text-zinc-500 max-w-md mx-auto">
            Create your first topic to start streaming data.
          </p>
        </div>
      ) : (
        <div className="dev-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-zinc-800 text-sm">
              <thead className="bg-zinc-950">
                <tr>
                  <th className="px-5 py-4 text-left text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest">
                    TOPIC_NAME
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest">
                    PARTITIONS
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest">
                    REPLICATION
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest">
                    MESSAGES
                  </th>
                  <th className="px-5 py-4 text-left text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest">
                    CONSUMERS
                  </th>
                  <th className="px-5 py-4 text-right text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest">
                    ACTIONS
                  </th>
                </tr>
              </thead>
              <tbody className="bg-black divide-y divide-zinc-900">
                {filteredTopics.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-zinc-500 font-mono text-xs uppercase tracking-widest">
                      NO_TOPICS_MATCH_SEARCH
                    </td>
                  </tr>
                ) : (
                  filteredTopics.map((topic) => (
                    <Fragment key={topic.name}>
                    <tr className="hover:bg-zinc-900/50 transition-colors group">
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <button
                            onClick={() => toggleTopic(topic.name)}
                            className="p-1.5 hover:bg-zinc-800 mr-3 transition-colors rounded-none focus:outline-none"
                            title={expandedTopics.has(topic.name) ? 'Collapse' : 'Expand'}
                          >
                            {expandedTopics.has(topic.name) ? (
                              <ChevronUp className="w-4 h-4 text-zinc-500" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-zinc-500" />
                            )}
                          </button>
                          <div className="w-8 h-8 bg-zinc-950 border border-zinc-800 flex items-center justify-center mr-3 group-hover:border-emerald-500/50 transition-colors">
                            <Database className="w-4 h-4 text-emerald-500/70" />
                          </div>
                          <div>
                            <div className="text-sm font-bold font-mono text-zinc-100 tracking-tight">{topic.name}</div>
                            <div className="text-[10px] font-mono text-zinc-600 mt-0.5 uppercase tracking-widest">TOPIC_OBJ</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="dev-badge">
                            {topic.partitions}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="dev-badge">
                            {topic.replicationFactor}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <span className="text-sm font-bold text-zinc-300 font-mono">
                            {typeof topic.messageCount === 'number' ? nf.format(topic.messageCount) : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex items-center space-x-1.5">
                            <div className={`w-2 h-2 shadow-[0_0_8px_rgba(16,185,129,0.5)] ${
                              (topic.connectedConsumers || 0) > 0 ? 'bg-emerald-500' : 'bg-zinc-700 shadow-none'
                            }`}></div>
                            <span className="text-sm font-bold font-mono text-zinc-300">
                              {topic.connectedConsumers || 0}
                            </span>
                          </div>
                          {topic.consumerGroups && topic.consumerGroups.length > 0 && (
                            <div className="ml-2" title={`Consumer Groups: ${topic.consumerGroups.join(', ')}`}>
                              <span className="dev-badge text-cyan-500 border-cyan-900 bg-cyan-950/30">
                                {topic.consumerGroups.length}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openConfigEditor(topic.name)}
                            className="p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-900 rounded-none transition-colors"
                            title="Edit Configuration"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              const newCount = prompt(`Enter new partition count for ${topic.name} (can only increase):`);
                              if (newCount && parseInt(newCount) > 0) {
                                addPartitions(topic.name, parseInt(newCount));
                              }
                            }}
                            className="p-1.5 text-zinc-500 hover:text-cyan-400 hover:bg-zinc-900 rounded-none transition-colors"
                            title="Add Partitions"
                          >
                            <BarChart3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleCleanupMessages(topic.name, topic.messageCount)}
                            className="p-1.5 text-zinc-500 hover:text-amber-500 hover:bg-zinc-900 rounded-none transition-colors"
                            title="Cleanup Messages"
                            disabled={!topic.messageCount || topic.messageCount === 0}
                          >
                            <Eraser className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTopic(topic.name)}
                            className="p-1.5 text-zinc-500 hover:text-red-500 hover:bg-zinc-900 rounded-none transition-colors"
                            title="Delete Topic"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedTopics.has(topic.name) && (
                      <tr>
                        <td colSpan={6} className="px-5 py-4 bg-zinc-950 border-y border-zinc-900">
                          <div className="pt-2">
                            <h4 className="text-[10px] font-mono font-bold text-zinc-600 uppercase tracking-widest mb-3">CONFIGURATION_SETTINGS</h4>
                            {!topicConfigs[topic.name] ? (
                              <div className="text-xs font-mono text-zinc-500 italic">LOADING...</div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                                {Object.entries(topicConfigs[topic.name]).map(([key, value]) => (
                                  <div key={key} className="p-3 bg-black border border-zinc-800 hover:border-zinc-700 transition-colors">
                                    <div className="text-[10px] font-mono font-bold text-zinc-500 mb-1 flex items-center gap-1.5">
                                      <span className="truncate">{key}</span>
                                      <span
                                        className="inline-flex items-center justify-center w-3 h-3 text-zinc-600 hover:text-emerald-500 cursor-help transition-colors"
                                        title={getConfigTooltip(key)}
                                        aria-label={`Info about ${key}`}
                                      >
                                        [?]
                                      </span>
                                    </div>
                                    <div className="text-xs font-bold text-zinc-300 font-mono truncate">{value || 'default'}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Configuration Editor Modal */}
      {showConfigEditor && selectedTopic && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="dev-card max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl border-emerald-900/30">
            <div className="p-5 border-b border-zinc-800 bg-zinc-950">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold font-mono text-zinc-100 tracking-tight uppercase">
                  EDIT_CONFIG: <span className="text-emerald-400 font-mono ml-2">{selectedTopic}</span>
                </h3>
                <button
                  onClick={() => setShowConfigEditor(false)}
                  className="p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-zinc-900 rounded-none transition-colors focus:outline-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto bg-black">
              {configEditorLoading ? (
                <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
                  <RefreshCw className="w-8 h-8 animate-spin text-emerald-500 mb-4" />
                  <span className="text-xs font-mono font-bold uppercase tracking-widest">LOADING_CONFIG...</span>
                </div>
              ) : configEditorError ? (
                <div className="p-4 mb-4 text-xs font-mono font-bold text-red-400 bg-red-950/30 border border-red-900 uppercase">
                  ERR: {configEditorError}
                </div>
              ) : Object.keys(editingConfig).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {Object.entries(editingConfig).map(([key, value]) => (
                    <div key={key} className="space-y-1.5">
                      <label className="text-[10px] font-mono font-bold text-zinc-500 flex items-center gap-1.5 uppercase">
                        <span>{key}</span>
                        <span
                          className="inline-flex items-center justify-center w-3 h-3 text-zinc-600 hover:text-emerald-500 cursor-help transition-colors"
                          title={getConfigTooltip(key)}
                          aria-label={`Info about ${key}`}
                        >
                          [?]
                        </span>
                      </label>
                      <input
                        type="text"
                        value={value || ''}
                        onChange={(e) => setEditingConfig({
                          ...editingConfig,
                          [key]: e.target.value,
                        })}
                        className="w-full dev-input"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 text-xs font-mono font-bold text-zinc-500 bg-zinc-950 border border-zinc-800 uppercase tracking-widest">
                  <span>NO_PROPERTIES_FOUND</span>
                  <button
                    onClick={() => selectedTopic && openConfigEditor(selectedTopic)}
                    className="dev-btn py-1"
                  >
                    RETRY
                  </button>
                </div>
              )}
            </div>
            <div className="p-5 border-t border-zinc-800 bg-zinc-950 flex justify-end space-x-3">
              <button
                onClick={() => setShowConfigEditor(false)}
                className="dev-btn"
              >
                CANCEL
              </button>
              <button
                onClick={() => selectedTopic && updateTopicConfig(selectedTopic, editingConfig)}
                disabled={savingConfig || configEditorLoading || Object.keys(editingConfig).length === 0}
                className="dev-btn-primary disabled:opacity-50"
              >
                {savingConfig ? 'SAVING...' : 'SAVE_CONFIG'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
