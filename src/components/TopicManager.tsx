'use client';

import { useState } from 'react';
import { Plus, Trash2, Settings, RefreshCw, Edit3, ChevronDown, ChevronUp, Database, BarChart3, Zap, X } from 'lucide-react';

interface TopicConfig {
  'cleanup.policy': string;
  'compression.type': string;
  'delete.retention.ms': string;
  'file.delete.delay.ms': string;
  'flush.messages': string;
  'flush.ms': string;
  'follower.replication.throttled.replicas': string;
  'index.interval.bytes': string;
  'leader.replication.throttled.replicas': string;
  'max.compaction.lag.ms': string;
  'max.message.bytes': string;
  'message.downconversion.enable': string;
  'message.format.version': string;
  'message.timestamp.difference.max.ms': string;
  'message.timestamp.type': string;
  'min.cleanable.dirty.ratio': string;
  'min.compaction.lag.ms': string;
  'min.insync.replicas': string;
  'preallocate': string;
  'retention.bytes': string;
  'retention.ms': string;
  'segment.bytes': string;
  'segment.index.bytes': string;
  'segment.jitter.ms': string;
  'segment.ms': string;
  'unclean.leader.election.enable': string;
}

interface TopicManagerProps {
  topics: string[];
  onRefresh: () => void;
}

export default function TopicManager({ topics, onRefresh }: TopicManagerProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [expandedTopics, setExpandedTopics] = useState<Set<string>>(new Set());
  const [topicConfigs, setTopicConfigs] = useState<Record<string, Partial<TopicConfig>>>({});
  const [editingConfig, setEditingConfig] = useState<Partial<TopicConfig>>({});
  const [selectedTopicTemplate, setSelectedTopicTemplate] = useState<string>('custom');
  const [newTopic, setNewTopic] = useState({
    name: '',
    partitions: 1,
    replicationFactor: 1,
    configs: {
      'cleanup.policy': 'delete',
      'retention.ms': '604800000', // 7 days
      'retention.bytes': '-1',
      'segment.ms': '604800000',
      'max.message.bytes': '1048588',
      'min.insync.replicas': '1'
    }
  });
  const [loading, setLoading] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  // Topic size templates
  const topicTemplates = {
    custom: {
      name: 'Custom Configuration',
      description: 'Configure your own settings',
      partitions: 1,
      replicationFactor: 1,
      configs: {
        'cleanup.policy': 'delete',
        'retention.ms': '604800000', // 7 days
        'retention.bytes': '-1',
        'segment.ms': '604800000',
        'max.message.bytes': '1048588',
        'min.insync.replicas': '1'
      }
    },
    small: {
      name: 'Small Topic',
      description: 'Low-volume messaging (logs, events)',
      partitions: 1,
      replicationFactor: 1,
      configs: {
        'cleanup.policy': 'delete',
        'retention.ms': '86400000', // 1 day
        'retention.bytes': '104857600', // 100MB
        'segment.ms': '86400000', // 1 day
        'max.message.bytes': '65536', // 64KB
        'min.insync.replicas': '1'
      }
    },
    medium: {
      name: 'Medium Topic',
      description: 'Moderate-volume messaging (user events, metrics)',
      partitions: 3,
      replicationFactor: 1,
      configs: {
        'cleanup.policy': 'delete',
        'retention.ms': '604800000', // 7 days
        'retention.bytes': '1073741824', // 1GB
        'segment.ms': '604800000', // 7 days
        'max.message.bytes': '1048576', // 1MB
        'min.insync.replicas': '1'
      }
    },
    large: {
      name: 'Large Topic',
      description: 'High-volume messaging (analytics, streaming)',
      partitions: 6,
      replicationFactor: 1,
      configs: {
        'cleanup.policy': 'delete',
        'retention.ms': '2592000000', // 30 days
        'retention.bytes': '10737418240', // 10GB
        'segment.ms': '604800000', // 7 days
        'max.message.bytes': '10485760', // 10MB
        'min.insync.replicas': '1'
      }
    },
    streaming: {
      name: 'Streaming Topic',
      description: 'Real-time data streaming (IoT, sensor data)',
      partitions: 12,
      replicationFactor: 1,
      configs: {
        'cleanup.policy': 'delete',
        'retention.ms': '86400000', // 1 day
        'retention.bytes': '21474836480', // 20GB
        'segment.ms': '3600000', // 1 hour
        'max.message.bytes': '1048576', // 1MB
        'min.insync.replicas': '1'
      }
    },
    compacted: {
      name: 'Compacted Topic',
      description: 'Key-value store (configurations, state)',
      partitions: 1,
      replicationFactor: 1,
      configs: {
        'cleanup.policy': 'compact',
        'retention.ms': '-1', // Never delete
        'retention.bytes': '-1',
        'segment.ms': '604800000', // 7 days
        'max.message.bytes': '1048576', // 1MB
        'min.insync.replicas': '1',
        'min.cleanable.dirty.ratio': '0.5'
      }
    }
  };

  // Apply topic template
  const applyTopicTemplate = (templateKey: string) => {
    const template = topicTemplates[templateKey as keyof typeof topicTemplates];
    if (template) {
      setNewTopic({
        ...newTopic,
        partitions: template.partitions,
        replicationFactor: template.replicationFactor,
        configs: { ...template.configs }
      });
      setSelectedTopicTemplate(templateKey);
    }
  };

  // Format bytes for display
  const formatBytes = (bytes: string | number) => {
    const numBytes = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (numBytes === -1) return 'Unlimited';
    if (numBytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(numBytes) / Math.log(k));
    return parseFloat((numBytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format time for display
  const formatTime = (ms: string | number) => {
    const numMs = typeof ms === 'string' ? parseInt(ms) : ms;
    if (numMs === -1) return 'Never';
    const days = Math.floor(numMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((numMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    return `${hours}h`;
  };

  // Fetch topic configurations
  const fetchTopicConfig = async (topicName: string) => {
    try {
      const response = await fetch(`/api/topics/${topicName}/config`);
      if (response.ok) {
        const config = await response.json();
        setTopicConfigs(prev => ({ ...prev, [topicName]: config }));
        return config;
      }
    } catch (error) {
      console.error('Failed to fetch topic config:', error);
    }
    return {};
  };

  // Toggle topic expansion and fetch config if needed
  const toggleTopic = async (topicName: string) => {
    const newExpanded = new Set(expandedTopics);
    if (newExpanded.has(topicName)) {
      newExpanded.delete(topicName);
    } else {
      newExpanded.add(topicName);
      if (!topicConfigs[topicName]) {
        await fetchTopicConfig(topicName);
      }
    }
    setExpandedTopics(newExpanded);
  };

  // Create topic with advanced configuration
  const createTopic = async () => {
    if (!newTopic.name.trim()) {
      alert('Topic name is required');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTopic.name,
          partitions: newTopic.partitions,
          replicationFactor: newTopic.replicationFactor,
          configs: newTopic.configs
        })
      });

      if (response.ok) {
        setNewTopic({
          name: '',
          partitions: 1,
          replicationFactor: 1,
          configs: {
            'cleanup.policy': 'delete',
            'retention.ms': '604800000',
            'retention.bytes': '-1',
            'segment.ms': '604800000',
            'max.message.bytes': '1048588',
            'min.insync.replicas': '1'
          }
        });
        setSelectedTopicTemplate('custom');
        setIsCreating(false);
        onRefresh();
      } else {
        const error = await response.json();
        alert(`Failed to create topic: ${error.error}`);
      }
    } catch (error) {
      alert(`Error creating topic: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Update topic configuration
  const updateTopicConfig = async (topicName: string, configs: Partial<TopicConfig>) => {
    setSavingConfig(true);
    try {
      const response = await fetch(`/api/topics/${topicName}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configs })
      });

      if (response.ok) {
        await fetchTopicConfig(topicName);
        setShowConfigEditor(false);
        setSelectedTopic(null);
        alert('Topic configuration updated successfully!');
      } else {
        const error = await response.json();
        alert(`Failed to update configuration: ${error.error}`);
      }
    } catch (error) {
      alert(`Error updating configuration: ${error}`);
    } finally {
      setSavingConfig(false);
    }
  };

  // Add partitions to topic
  const addPartitions = async (topicName: string, newPartitionCount: number) => {
    if (newPartitionCount <= 0) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/topics/${topicName}/partitions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partitions: newPartitionCount })
      });

      if (response.ok) {
        onRefresh();
        alert(`Successfully added partitions to ${topicName}`);
      } else {
        const error = await response.json();
        alert(`Failed to add partitions: ${error.error}`);
      }
    } catch (error) {
      alert(`Error adding partitions: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteTopic = async (topicName: string) => {
    if (!confirm(`Are you sure you want to delete topic "${topicName}"? This action cannot be undone.`)) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/topics/${topicName}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        onRefresh();
      } else {
        const error = await response.json();
        alert(`Failed to delete topic: ${error.error}`);
      }
    } catch (error) {
      alert(`Error deleting topic: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="h-12 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-slate-100 dark:bg-slate-800 rounded-md flex items-center justify-center">
            <Settings className="w-4 h-4 text-slate-700 dark:text-slate-300" />
          </div>
          <div className="leading-tight">
            <h1 className="text-sm font-semibold">Topic Management</h1>
            <p className="text-[11px] text-slate-500">Advanced configuration</p>
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
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-sm font-medium rounded-md text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-white bg-slate-900 dark:bg-slate-700 hover:bg-black/80"
        >
          <Plus className="w-4 h-4 mr-2" />
          Create Topic
        </button>
      </div>

      {/* Create Topic Form */}
      {isCreating && (
        <div className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Create New Topic</h3>
              <button
                onClick={() => setIsCreating(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-md hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Topic Size Templates */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-md p-3">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3 flex items-center">
                  <Database className="w-4 h-4 mr-2" />
                  Topic Size Templates
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(topicTemplates).map(([key, template]) => (
                    <button
                      key={key}
                      onClick={() => applyTopicTemplate(key)}
                      className={`p-3 rounded-md border text-left transition-colors ${
                        selectedTopicTemplate === key
                          ? 'border-slate-400 bg-white dark:bg-slate-900'
                          : 'border-slate-200 dark:border-slate-800 hover:border-slate-400'
                      }`}
                    >
                      <div className="font-medium text-sm text-slate-900 dark:text-white">
                        {template.name}
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                        {template.description}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-500 mt-2 space-y-1">
                        <div>Partitions: {template.partitions}</div>
                        <div>Max Size: {formatBytes(template.configs['max.message.bytes'] || '0')}</div>
                        <div>Retention: {formatTime(template.configs['retention.ms'] || '0')}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Basic Configuration */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Topic Name
                  </label>
                  <input
                    type="text"
                    value={newTopic.name}
                    onChange={(e) => setNewTopic({ ...newTopic, name: e.target.value })}
                    placeholder="Enter topic name"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Partitions
                  </label>
                  <input
                    type="number"
                    value={newTopic.partitions}
                    onChange={(e) => {
                      setNewTopic({ ...newTopic, partitions: parseInt(e.target.value) || 1 });
                      setSelectedTopicTemplate('custom');
                    }}
                    min="1"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                    Replication Factor
                  </label>
                  <input
                    type="number"
                    value={newTopic.replicationFactor}
                    onChange={(e) => {
                      setNewTopic({ ...newTopic, replicationFactor: parseInt(e.target.value) || 1 });
                      setSelectedTopicTemplate('custom');
                    }}
                    min="1"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Advanced Configuration */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-3 flex items-center">
                  <Zap className="w-4 h-4 mr-2" />
                  Advanced Configuration
                  {selectedTopicTemplate !== 'custom' && (
                    <span className="ml-2 px-2 py-1 text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 rounded-full">
                      {topicTemplates[selectedTopicTemplate as keyof typeof topicTemplates].name}
                    </span>
                  )}
                </h4>
                {selectedTopicTemplate !== 'custom' && (
                  <div className="mb-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-md">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Template applied. You can still modify the settings below.
                    </p>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Cleanup Policy
                    </label>
                    <select
                      value={newTopic.configs['cleanup.policy']}
                      onChange={(e) => {
                        setNewTopic({
                          ...newTopic,
                          configs: { ...newTopic.configs, 'cleanup.policy': e.target.value }
                        });
                        setSelectedTopicTemplate('custom');
                      }}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    >
                      <option value="delete">Delete</option>
                      <option value="compact">Compact</option>
                      <option value="compact,delete">Compact + Delete</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Retention Time (ms)
                    </label>
                    <input
                      type="number"
                      value={newTopic.configs['retention.ms']}
                      onChange={(e) => {
                        setNewTopic({
                          ...newTopic,
                          configs: { ...newTopic.configs, 'retention.ms': e.target.value }
                        });
                        setSelectedTopicTemplate('custom');
                      }}
                      placeholder="604800000 (7 days)"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Max Message Size (bytes)
                    </label>
                    <input
                      type="number"
                      value={newTopic.configs['max.message.bytes']}
                      onChange={(e) => {
                        setNewTopic({
                          ...newTopic,
                          configs: { ...newTopic.configs, 'max.message.bytes': e.target.value }
                        });
                        setSelectedTopicTemplate('custom');
                      }}
                      placeholder="1048588"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      Min In-Sync Replicas
                    </label>
                    <input
                      type="number"
                      value={newTopic.configs['min.insync.replicas']}
                      onChange={(e) => {
                        setNewTopic({
                          ...newTopic,
                          configs: { ...newTopic.configs, 'min.insync.replicas': e.target.value }
                        });
                        setSelectedTopicTemplate('custom');
                      }}
                      placeholder="1"
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={createTopic}
                  disabled={loading}
                  className="px-3 py-1.5 bg-slate-900 dark:bg-slate-700 text-white rounded-md hover:bg-black/80 disabled:opacity-50 font-medium"
                >
                  {loading ? 'Creating...' : 'Create Topic'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Topics List */}
      {topics.length === 0 ? (
        <div className="text-center py-12">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Database className="w-10 h-10 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">No Topics Found</h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Create your first topic to start managing Kafka configurations.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {topics.map((topic) => (
            <div key={topic} className="bg-white dark:bg-slate-900 rounded-md border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <button
                      onClick={() => toggleTopic(topic)}
                      className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md"
                    >
                      {expandedTopics.has(topic) ? (
                        <ChevronUp className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                      )}
                    </button>
                    <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 rounded-md flex items-center justify-center">
                      <Database className="w-4 h-4 text-slate-700 dark:text-slate-300" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-900 dark:text-white">{topic}</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {topicConfigs[topic] ? 'Configuration loaded' : 'Click to view configuration'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => {
                        setSelectedTopic(topic);
                        setEditingConfig(topicConfigs[topic] || {});
                        setShowConfigEditor(true);
                      }}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                      title="Edit Configuration"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        const newCount = prompt(`Current partitions for ${topic}. Enter new partition count (can only increase):`);
                        if (newCount && parseInt(newCount) > 0) {
                          addPartitions(topic, parseInt(newCount));
                        }
                      }}
                      className="p-1.5 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-md"
                      title="Add Partitions"
                    >
                      <BarChart3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteTopic(topic)}
                      className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md"
                      title="Delete Topic"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expanded Topic Configuration */}
                {expandedTopics.has(topic) && topicConfigs[topic] && (
                  <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                    <h4 className="text-md font-semibold text-slate-900 dark:text-white mb-3">Configuration</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(topicConfigs[topic]).map(([key, value]) => (
                        <div key={key} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-md">
                          <div className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            {key}
                          </div>
                          <div className="text-sm text-slate-600 dark:text-slate-400 font-mono">
                            {value || 'default'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(editingConfig).map(([key, value]) => (
                  <div key={key} className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {key}
                    </label>
                    <input
                      type="text"
                      value={value || ''}
                      onChange={(e) => setEditingConfig({
                        ...editingConfig,
                        [key]: e.target.value
                      })}
                      className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-slate-500 focus:border-transparent font-mono text-sm"
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-end space-x-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={() => setShowConfigEditor(false)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => updateTopicConfig(selectedTopic, editingConfig)}
                  disabled={savingConfig}
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
