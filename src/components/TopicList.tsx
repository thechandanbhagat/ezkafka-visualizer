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

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="h-12 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-md flex items-center justify-center">
            <Database className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold">Kafka Topics</h1>
            <p className="text-[11px] text-slate-500">Manage topics and partitions</p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold">{topics.length}</div>
          <div className="text-[10px] text-slate-500">Topics</div>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex justify-between items-center">
        <div className="flex space-x-2">
          <button
            onClick={() => onRefresh(selectedProfileId)}
            disabled={loading}
            className="inline-flex items-center px-3 py-1.5 border border-slate-300 dark:border-slate-600 text-sm font-medium rounded-md text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <button
          onClick={() => setShowCreateForm(true)}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-slate-900 dark:bg-slate-700 hover:bg-black/80"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Topic
        </button>
      </div>

      {/* Create Topic Form */}
      {showCreateForm && (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create New Topic</h3>
              <button
                onClick={() => setShowCreateForm(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <Plus className="w-4 h-4 rotate-45" />
              </button>
            </div>
            
            <form onSubmit={handleCreateTopic} className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Topic Name
                  </label>
                  <input
                    type="text"
                    value={newTopicName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    placeholder="Enter topic name"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    Partitions
                  </label>
                  <input
                    type="number"
                    value={newTopicPartitions}
                    onChange={(e) => setNewTopicPartitions(parseInt(e.target.value) || 1)}
                    min="1"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white rounded-md hover:bg-black/80 disabled:opacity-50 font-medium"
                >
                  {creating ? 'Creating...' : 'Create Topic'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Topics List */}
      {loading && topics.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-16 h-16 bg-purple-100 dark:bg-purple-900/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <div className="animate-spin w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full"></div>
          </div>
          <p className="text-lg font-medium text-slate-700 dark:text-slate-300">Loading topics...</p>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-24 h-24 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Database className="w-12 h-12 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Topics Found</h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Create your first topic to start streaming data with Kafka.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Topic Name
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Partitions
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Replication
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Messages
                  </th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Consumers
                  </th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-200 dark:divide-slate-800">
                {topics.map((topic) => (
                  <Fragment key={topic.name}>
                    <tr className="hover:bg-slate-50 dark:hover:bg-slate-800">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <button
                            onClick={() => toggleTopic(topic.name)}
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md mr-2"
                            title={expandedTopics.has(topic.name) ? 'Collapse' : 'Expand'}
                          >
                            {expandedTopics.has(topic.name) ? (
                              <ChevronUp className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                            )}
                          </button>
                          <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-md flex items-center justify-center mr-2">
                            <MessageCircle className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                          </div>
                          <div>
                            <div className="text-sm font-medium text-slate-900 dark:text-white">{topic.name}</div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">Kafka Topic</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <BarChart3 className="w-4 h-4 text-slate-400 mr-2" />
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{topic.partitions}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <Users className="w-4 h-4 text-slate-400 mr-2" />
                          <span className="text-sm font-medium text-slate-900 dark:text-white">{topic.replicationFactor}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <MessageCircle className="w-4 h-4 text-slate-400 mr-2" />
                          <span className="text-sm font-medium text-slate-900 dark:text-white">
                            {typeof topic.messageCount === 'number' ? nf.format(topic.messageCount) : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex items-center space-x-1">
                            <div className={`w-2 h-2 rounded-full ${
                              (topic.connectedConsumers || 0) > 0 ? 'bg-green-400' : 'bg-slate-300'
                            }`}></div>
                            <span className="text-sm font-medium text-slate-900 dark:text-white">
                              {topic.connectedConsumers || 0}
                            </span>
                          </div>
                          {topic.consumerGroups && topic.consumerGroups.length > 0 && (
                            <div className="ml-2" title={`Consumer Groups: ${topic.consumerGroups.join(', ')}`}>
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                {topic.consumerGroups.length}
                              </span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => openConfigEditor(topic.name)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
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
                            className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md"
                            title="Add Partitions"
                          >
                            <BarChart3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTopic(topic.name)}
                            className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                            title="Delete Topic"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedTopics.has(topic.name) && (
                      <tr>
                        <td colSpan={6} className="px-3 py-3 bg-slate-50 dark:bg-slate-900/60">
                          <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Configuration</h4>
                            {!topicConfigs[topic.name] ? (
                              <div className="text-xs text-slate-500">Loading configuration…</div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                {Object.entries(topicConfigs[topic.name]).map(([key, value]) => (
                                  <div key={key} className="p-2 bg-white dark:bg-slate-800 rounded-md border border-slate-200 dark:border-slate-700">
                                    <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1">
                                      <span>{key}</span>
                                      <span
                                        className="inline-flex items-center justify-center w-4 h-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-help"
                                        title={getConfigTooltip(key)}
                                        aria-label={`Info about ${key}`}
                                      >
                                        i
                                      </span>
                                    </div>
                                    <div className="text-xs text-slate-600 dark:text-slate-400 font-mono break-words">{value || 'default'}</div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Configuration Editor Modal */}
      {showConfigEditor && selectedTopic && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                  Edit Configuration: {selectedTopic}
                </h3>
                <button
                  onClick={() => setShowConfigEditor(false)}
                  className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4">
              {configEditorLoading ? (
                <div className="flex items-center justify-center py-8 text-slate-500 text-sm">Loading configuration…</div>
              ) : configEditorError ? (
                <div className="p-3 mb-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-300 rounded">
                  {configEditorError}
                </div>
              ) : Object.keys(editingConfig).length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {Object.entries(editingConfig).map(([key, value]) => (
                    <div key={key} className="space-y-2">
                      <label className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                        <span>{key}</span>
                        <span
                          className="inline-flex items-center justify-center w-4 h-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-help"
                          title={getConfigTooltip(key)}
                          aria-label={`Info about ${key}`}
                        >
                          i
                        </span>
                      </label>
                      <input
                        type="text"
                        value={value || ''}
                        onChange={(e) => setEditingConfig({
                          ...editingConfig,
                          [key]: e.target.value,
                        })}
                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent font-mono text-sm"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-between p-3 text-sm text-slate-500 bg-slate-50 dark:bg-slate-800/60 rounded">
                  <span>No configuration properties loaded.</span>
                  <button
                    onClick={() => selectedTopic && openConfigEditor(selectedTopic)}
                    className="px-2 py-1 text-xs rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700"
                  >
                    Retry
                  </button>
                </div>
              )}
              <div className="flex justify-end space-x-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setShowConfigEditor(false)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => selectedTopic && updateTopicConfig(selectedTopic, editingConfig)}
                  disabled={savingConfig || configEditorLoading || Object.keys(editingConfig).length === 0}
                  className="px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white rounded-md hover:bg-black/80 disabled:opacity-50 font-medium"
                >
                  {savingConfig ? 'Saving...' : 'Save Configuration'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
