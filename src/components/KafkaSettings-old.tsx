'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface KafkaSettings {
  brokers: string[];
  clientId: string;
  appName?: string;
  connectionTimeout: number;
  requestTimeout: number;
  maxMessageSize: number;
  retries: number;
  initialRetryTime: number;
  acks: number;
  compressionType: string;
  batchSize: number;
  lingerMs: number;
}

interface KafkaSettingsProps {
  onSettingsUpdate?: (settings: KafkaSettings) => void;
}

export default function KafkaSettings({ onSettingsUpdate }: KafkaSettingsProps) {
  const [settings, setSettings] = useState<KafkaSettings>({
    brokers: ['localhost:9092'],
    clientId: 'ezkafka-visualizer',
    appName: 'EZ Kafka Visualizer',
    connectionTimeout: 10000,
    requestTimeout: 30000,
    maxMessageSize: 1000000,
    retries: 3,
    initialRetryTime: 300,
    acks: 1,
    compressionType: 'none',
    batchSize: 16384,
    lingerMs: 0
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [brokerInput, setBrokerInput] = useState('');
  const [messageSizePresets, setMessageSizePresets] = useState<Record<string, number>>({
    small: 1024,      // 1KB - small messages
    medium: 65536,    // 64KB - medium messages  
    large: 1048576,   // 1MB - large messages
    xlarge: 10485760, // 10MB - very large messages
    max: 100000000    // 100MB - maximum size
  });
  const [selectedPreset, setSelectedPreset] = useState<string>('custom');

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch('/api/settings');
      const data = await response.json();
      if (data.success) {
        setSettings(data.settings);
        setBrokerInput(data.settings.brokers.join(', '));
        
        // Check if current message size matches a preset
        const currentSize = data.settings.maxMessageSize;
        const presetKey = Object.keys(messageSizePresets).find(
          key => messageSizePresets[key] === currentSize
        );
        setSelectedPreset(presetKey || 'custom');
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  }, [messageSizePresets]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSaveSettings = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Parse brokers from input
      const brokers = brokerInput
        .split(',')
        .map(broker => broker.trim())
        .filter(broker => broker.length > 0);

      const updatedSettings = { ...settings, brokers };

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updatedSettings),
      });

      const data = await response.json();

      if (data.success) {
        setSettings(data.settings);
        setMessage({ type: 'success', text: 'Settings saved successfully!' });
        onSettingsUpdate?.(data.settings);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' });
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'Failed to save settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleResetSettings = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
      });

      const data = await response.json();

      if (data.success) {
        setSettings(data.settings);
        setBrokerInput(data.settings.brokers.join(', '));
        if (data.presets?.messageSizes) {
          setMessageSizePresets(data.presets.messageSizes);
          // Check if reset message size matches a preset
          const presetKey = Object.keys(data.presets.messageSizes).find(
            key => data.presets.messageSizes[key] === data.settings.maxMessageSize
          );
          setSelectedPreset(presetKey || 'custom');
        }
        setMessage({ type: 'success', text: 'Settings reset to defaults!' });
        onSettingsUpdate?.(data.settings);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to reset settings' });
      }
    } catch (error) {
      console.error('Error resetting settings:', error);
      setMessage({ type: 'error', text: 'Failed to reset settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleInputChange = (field: keyof KafkaSettings, value: string | number) => {
    setSettings(prev => ({ ...prev, [field]: value }));
  };

  const handlePresetChange = (presetKey: string) => {
    setSelectedPreset(presetKey);
    if (presetKey !== 'custom' && messageSizePresets[presetKey]) {
      handleInputChange('maxMessageSize', messageSizePresets[presetKey]);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getMessageSizeDescription = (size: number) => {
    if (size <= 1024) return 'Tiny messages - Good for simple notifications';
    if (size <= 10240) return 'Small messages - Suitable for basic data';
    if (size <= 102400) return 'Medium messages - Good for structured data';
    if (size <= 1048576) return 'Large messages - Suitable for JSON documents';
    if (size <= 10485760) return 'X-Large messages - Good for file transfers';
    if (size <= 52428800) return 'XX-Large messages - For large data payloads';
    return 'Maximum size - For very large data transfers';
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">Kafka Settings</h2>
        <div className="flex space-x-2">
          <button
            onClick={handleResetSettings}
            disabled={saving}
            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleSaveSettings}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>

      {message && (
        <div className={`mb-4 p-3 rounded-lg ${
          message.type === 'success' 
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
        }`}>
          {message.text}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Connection Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600 pb-2">
            Connection Settings
          </h3>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Application Name
            </label>
            <input
              type="text"
              value={settings.appName || ''}
              onChange={(e) => handleInputChange('appName' as keyof KafkaSettings, e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="EZ Kafka Visualizer"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              This name appears in the UI and browser title.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Kafka Brokers (comma-separated)
            </label>
            <input
              type="text"
              value={brokerInput}
              onChange={(e) => setBrokerInput(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              placeholder="localhost:9092, broker2:9092"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Enter broker addresses separated by commas
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Client ID
            </label>
            <input
              type="text"
              value={settings.clientId}
              onChange={(e) => handleInputChange('clientId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Connection Timeout (ms)
            </label>
            <input
              type="number"
              value={settings.connectionTimeout}
              onChange={(e) => handleInputChange('connectionTimeout', parseInt(e.target.value))}
              min="1000"
              max="60000"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              1,000 - 60,000 ms
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Request Timeout (ms)
            </label>
            <input
              type="number"
              value={settings.requestTimeout}
              onChange={(e) => handleInputChange('requestTimeout', parseInt(e.target.value))}
              min="1000"
              max="120000"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              1,000 - 120,000 ms
            </p>
          </div>
        </div>

        {/* Producer Settings */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600 pb-2">
            Producer Settings
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Max Message Size
            </label>
            
            {/* Preset Selector */}
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Quick Presets
              </label>
              <select
                value={selectedPreset}
                onChange={(e) => handlePresetChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="custom">Custom Size</option>
                <option value="small">Small (1 KB) - Simple text messages</option>
                <option value="medium">Medium (64 KB) - Small JSON documents</option>
                <option value="large">Large (1 MB) - Large JSON documents</option>
                <option value="xlarge">X-Large (10 MB) - Files or large payloads</option>
                <option value="max">Maximum (100 MB) - Very large files</option>
              </select>
            </div>

            {/* Custom Input */}
            <div className="mb-2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {selectedPreset === 'custom' ? 'Custom Size (bytes)' : 'Current Size (bytes)'}
              </label>
              <input
                type="number"
                value={settings.maxMessageSize}
                onChange={(e) => {
                  handleInputChange('maxMessageSize', parseInt(e.target.value));
                  setSelectedPreset('custom');
                }}
                min="1024"
                max="100000000"
                disabled={selectedPreset !== 'custom'}
                className={`w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 ${
                  selectedPreset !== 'custom' ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              />
            </div>
            
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>Current: {formatBytes(settings.maxMessageSize)}</span>
              <span>Range: 1KB - 100MB</span>
            </div>
            
            {/* Message Size Description */}
            <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                💡 {getMessageSizeDescription(settings.maxMessageSize)}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Acknowledgments (acks)
            </label>
            <select
              value={settings.acks}
              onChange={(e) => handleInputChange('acks', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>0 - No acknowledgment</option>
              <option value={1}>1 - Leader acknowledgment</option>
              <option value={-1}>-1 - All in-sync replicas</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Compression Type
            </label>
            <select
              value={settings.compressionType}
              onChange={(e) => handleInputChange('compressionType', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="none">None</option>
              <option value="gzip">Gzip</option>
              <option value="snappy">Snappy</option>
              <option value="lz4">LZ4</option>
              <option value="zstd">Zstandard</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Batch Size (bytes)
            </label>
            <input
              type="number"
              value={settings.batchSize}
              onChange={(e) => handleInputChange('batchSize', parseInt(e.target.value))}
              min="1"
              max="1000000"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Current: {formatBytes(settings.batchSize)}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Linger Time (ms)
            </label>
            <input
              type="number"
              value={settings.lingerMs}
              onChange={(e) => handleInputChange('lingerMs', parseInt(e.target.value))}
              min="0"
              max="60000"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Time to wait for batching messages (0-60,000 ms)
            </p>
          </div>
        </div>

        {/* Retry Settings */}
        <div className="space-y-4 md:col-span-2">
          <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 border-b border-gray-200 dark:border-gray-600 pb-2">
            Retry Settings
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Max Retries
              </label>
              <input
                type="number"
                value={settings.retries}
                onChange={(e) => handleInputChange('retries', parseInt(e.target.value))}
                min="0"
                max="10"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Initial Retry Time (ms)
              </label>
              <input
                type="number"
                value={settings.initialRetryTime}
                onChange={(e) => handleInputChange('initialRetryTime', parseInt(e.target.value))}
                min="100"
                max="10000"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Settings Summary */}
      <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Current Configuration Summary</h4>
        <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
          <div>• App Name: {settings.appName || 'EZ Kafka Visualizer'}</div>
          <div>• Brokers: {settings.brokers.join(', ')}</div>
          <div>• Client ID: {settings.clientId}</div>
          <div>• Max Message Size: {formatBytes(settings.maxMessageSize)}</div>
          <div>• Compression: {settings.compressionType}</div>
          <div>• Acknowledgments: {settings.acks === -1 ? 'All replicas' : settings.acks === 0 ? 'None' : 'Leader only'}</div>
          <div>• Retries: {settings.retries} (initial delay: {settings.initialRetryTime}ms)</div>
        </div>
      </div>
    </div>
  );
}
