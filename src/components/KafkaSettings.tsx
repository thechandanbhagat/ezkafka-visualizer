'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  type KafkaSettings, 
  KafkaServerProfile, 
  MultiServerConfig
} from '@/lib/kafka-settings';

interface KafkaSettingsProps {
  onSettingsUpdate?: (config: MultiServerConfig) => void;
}

interface ProfileFormData {
  name: string;
  description: string;
  brokers: string;
  clientId: string;
  appName: string;
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

export default function KafkaSettings({ onSettingsUpdate }: KafkaSettingsProps) {
  const [multiServerConfig, setMultiServerConfig] = useState<MultiServerConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'profiles' | 'current'>('profiles');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<KafkaServerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [formData, setFormData] = useState<ProfileFormData>({
    name: '',
    description: '',
    brokers: 'localhost:9092',
    clientId: 'ezkafka-visualizer',
    appName: 'EZ Kafka Visualizer',
    connectionTimeout: 10000,
    requestTimeout: 30000,
    maxMessageSize: 1048576,
    retries: 3,
    initialRetryTime: 300,
    acks: 1,
    compressionType: 'none',
    batchSize: 16384,
    lingerMs: 0
  });

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/settings');
      const data = await response.json();

      if (data.success) {
        setMultiServerConfig(data.multiServerConfig);
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleCreateProfile = async () => {
    if (!formData.name.trim()) {
      setMessage({ type: 'error', text: 'Profile name is required' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const brokers = formData.brokers
        .split(',')
        .map(broker => broker.trim())
        .filter(broker => broker.length > 0);

      const settings: KafkaSettings = {
        brokers,
        clientId: formData.clientId,
        appName: formData.appName,
        connectionTimeout: formData.connectionTimeout,
        requestTimeout: formData.requestTimeout,
        maxMessageSize: formData.maxMessageSize,
        retries: formData.retries,
        initialRetryTime: formData.initialRetryTime,
        acks: formData.acks,
        compressionType: formData.compressionType,
        batchSize: formData.batchSize,
        lingerMs: formData.lingerMs,
      };

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'createProfile',
          name: formData.name,
          description: formData.description,
          settings
        }),
      });

      const result = await response.json();

      if (result.success) {
        setMultiServerConfig(result.multiServerConfig);
        setShowCreateForm(false);
        resetForm();
        setMessage({ type: 'success', text: 'Profile created successfully' });
        onSettingsUpdate?.(result.multiServerConfig);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to create profile' });
      }
    } catch (error) {
      console.error('Error creating profile:', error);
      setMessage({ type: 'error', text: 'Failed to create profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!editingProfile || !formData.name.trim()) {
      setMessage({ type: 'error', text: 'Profile name is required' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const brokers = formData.brokers
        .split(',')
        .map(broker => broker.trim())
        .filter(broker => broker.length > 0);

      const updatedProfile: KafkaServerProfile = {
        ...editingProfile,
        name: formData.name,
        description: formData.description,
        settings: {
          brokers,
          clientId: formData.clientId,
          appName: formData.appName,
          connectionTimeout: formData.connectionTimeout,
          requestTimeout: formData.requestTimeout,
          maxMessageSize: formData.maxMessageSize,
          retries: formData.retries,
          initialRetryTime: formData.initialRetryTime,
          acks: formData.acks,
          compressionType: formData.compressionType,
          batchSize: formData.batchSize,
          lingerMs: formData.lingerMs,
        }
      };

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateProfile',
          profile: updatedProfile
        }),
      });

      const result = await response.json();

      if (result.success) {
        setMultiServerConfig(result.multiServerConfig);
        setEditingProfile(null);
        resetForm();
        setMessage({ type: 'success', text: 'Profile updated successfully' });
        onSettingsUpdate?.(result.multiServerConfig);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to update profile' });
      }
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (!confirm('Are you sure you want to delete this profile?')) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'deleteProfile',
          profileId
        }),
      });

      const result = await response.json();

      if (result.success) {
        setMultiServerConfig(result.multiServerConfig);
        setMessage({ type: 'success', text: 'Profile deleted successfully' });
        onSettingsUpdate?.(result.multiServerConfig);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to delete profile' });
      }
    } catch (error) {
      console.error('Error deleting profile:', error);
      setMessage({ type: 'error', text: 'Failed to delete profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleSwitchProfile = async (profileId: string) => {
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'switchProfile',
          profileId
        }),
      });

      const result = await response.json();

      if (result.success) {
        setMultiServerConfig(result.multiServerConfig);
        setMessage({ type: 'success', text: 'Profile switched successfully' });
        onSettingsUpdate?.(result.multiServerConfig);
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to switch profile' });
      }
    } catch (error) {
      console.error('Error switching profile:', error);
      setMessage({ type: 'error', text: 'Failed to switch profile' });
    } finally {
      setSaving(false);
    }
  };

  const handleEditProfile = (profile: KafkaServerProfile) => {
    setEditingProfile(profile);
    setFormData({
      name: profile.name,
      description: profile.description || '',
      brokers: profile.settings.brokers.join(', '),
      clientId: profile.settings.clientId,
      appName: profile.settings.appName || 'EZ Kafka Visualizer',
      connectionTimeout: profile.settings.connectionTimeout,
      requestTimeout: profile.settings.requestTimeout,
      maxMessageSize: profile.settings.maxMessageSize,
      retries: profile.settings.retries,
      initialRetryTime: profile.settings.initialRetryTime,
      acks: profile.settings.acks,
      compressionType: profile.settings.compressionType,
      batchSize: profile.settings.batchSize,
      lingerMs: profile.settings.lingerMs,
    });
    setShowCreateForm(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      brokers: 'localhost:9092',
      clientId: 'ezkafka-visualizer',
      appName: 'EZ Kafka Visualizer',
      connectionTimeout: 10000,
      requestTimeout: 30000,
      maxMessageSize: 1048576,
      retries: 3,
      initialRetryTime: 300,
      acks: 1,
      compressionType: 'none',
      batchSize: 16384,
      lingerMs: 0
    });
  };

  const cancelForm = () => {
    setShowCreateForm(false);
    setEditingProfile(null);
    resetForm();
    setMessage(null);
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600 dark:text-gray-300">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
      <div className="p-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          Kafka Server Configuration
        </h2>

        {/* Message Display */}
        {message && (
          <div className={`mb-4 p-4 rounded-md ${
            message.type === 'success' 
              ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('profiles')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'profiles'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Server Profiles
            </button>
            <button
              onClick={() => setActiveTab('current')}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'current'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              Current Configuration
            </button>
          </nav>
        </div>

        {/* Profiles Tab */}
        {activeTab === 'profiles' && multiServerConfig && (
          <div>
            {/* Profile List */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Server Profiles ({multiServerConfig.profiles.length})
                </h3>
                <button
                  onClick={() => setShowCreateForm(true)}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-md text-sm font-medium"
                >
                  Add New Profile
                </button>
              </div>

              <div className="space-y-4">
                {multiServerConfig.profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className={`border rounded-lg p-4 ${
                      profile.id === multiServerConfig.activeProfileId
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {profile.name}
                          </h4>
                          {profile.id === multiServerConfig.activeProfileId && (
                            <span className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 text-xs px-2 py-1 rounded-full">
                              Active
                            </span>
                          )}
                        </div>
                        {profile.description && (
                          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            {profile.description}
                          </p>
                        )}
                        <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                          <span className="font-medium">Brokers:</span> {profile.settings.brokers.join(', ')}
                        </div>
                        {profile.lastConnected && (
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Last connected: {new Date(profile.lastConnected).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <div className="flex gap-2 ml-4">
                        {profile.id !== multiServerConfig.activeProfileId && (
                          <button
                            onClick={() => handleSwitchProfile(profile.id)}
                            disabled={saving}
                            className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium disabled:opacity-50"
                          >
                            Switch
                          </button>
                        )}
                        <button
                          onClick={() => handleEditProfile(profile)}
                          disabled={saving}
                          className="text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300 text-sm font-medium disabled:opacity-50"
                        >
                          Edit
                        </button>
                        {multiServerConfig.profiles.length > 1 && (
                          <button
                            onClick={() => handleDeleteProfile(profile.id)}
                            disabled={saving}
                            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Create/Edit Profile Form */}
            {showCreateForm && (
              <div className="border-t pt-6">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                  {editingProfile ? 'Edit Profile' : 'Create New Profile'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Basic Information */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Profile Name *
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="e.g., Production Kafka"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Description
                    </label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="Optional description"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Brokers *
                    </label>
                    <input
                      type="text"
                      value={formData.brokers}
                      onChange={(e) => setFormData({ ...formData, brokers: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                      placeholder="localhost:9092, broker2:9092"
                    />
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Comma-separated list of broker addresses
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Client ID
                    </label>
                    <input
                      type="text"
                      value={formData.clientId}
                      onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Application Name
                    </label>
                    <input
                      type="text"
                      value={formData.appName}
                      onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div className="flex gap-4 mt-6">
                  <button
                    onClick={editingProfile ? handleUpdateProfile : handleCreateProfile}
                    disabled={saving || !formData.name.trim()}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2 rounded-md font-medium"
                  >
                    {saving ? 'Saving...' : (editingProfile ? 'Update Profile' : 'Create Profile')}
                  </button>
                  <button
                    onClick={cancelForm}
                    disabled={saving}
                    className="bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-700 disabled:opacity-50 text-gray-700 dark:text-gray-300 px-6 py-2 rounded-md font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Current Configuration Tab */}
        {activeTab === 'current' && multiServerConfig && (
          <div>
            {(() => {
              const activeProfile = multiServerConfig.profiles.find(p => p.id === multiServerConfig.activeProfileId);
              return activeProfile ? (
                <div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                    Active Profile: {activeProfile.name}
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Brokers</dt>
                        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{activeProfile.settings.brokers.join(', ')}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Client ID</dt>
                        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{activeProfile.settings.clientId}</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Connection Timeout</dt>
                        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{activeProfile.settings.connectionTimeout}ms</dd>
                      </div>
                      <div>
                        <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Request Timeout</dt>
                        <dd className="mt-1 text-sm text-gray-900 dark:text-white">{activeProfile.settings.requestTimeout}ms</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No active profile found</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}