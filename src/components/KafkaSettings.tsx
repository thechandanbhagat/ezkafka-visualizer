'use client';

import React, { useState } from 'react';
import { useServer } from '@/contexts/ServerContext';
import {
  type KafkaSettings,
  KafkaServerProfile,
  MultiServerConfig
} from '@/lib/kafka-settings';

// @group Types : Component data contracts
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

// @group BusinessLogic : Component state and interactions
export default function KafkaSettings({ onSettingsUpdate }: KafkaSettingsProps) {
  const { multiServerConfig, selectedProfileId, applyConfig, switchProfile, isLoading: loading, error: configError, refreshConfig } = useServer();
  const [activeTab, setActiveTab] = useState<'profiles' | 'current'>('profiles');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingProfile, setEditingProfile] = useState<KafkaServerProfile | null>(null);
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

      if (response.ok && result.success) {
        applyConfig(result.multiServerConfig);
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

      if (response.ok && result.success) {
        applyConfig(result.multiServerConfig);
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

      if (response.ok && result.success) {
        applyConfig(result.multiServerConfig);
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
    await switchProfile(profileId);
    setMessage({ type: 'success', text: 'Cluster selected for this browser' });
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
      <div className="dev-card p-8">
        <div className="flex flex-col items-center justify-center">
          <div className="w-7 h-7 rounded-full border-2 border-line border-t-accent animate-spin mb-4"></div>
          <span className="text-xs font-semibold text-muted">Loading settings...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        {/* @group Presentation : Cluster profiles and configuration */}
        <h1 className="text-xl font-semibold text-ink tracking-tight mb-4">
          Connection settings
        </h1>

        {configError && <div role="alert" className="mb-4 p-3 text-sm rounded-lg border border-danger/20 text-danger">{configError}<button className="dev-btn ml-3" onClick={() => void refreshConfig()}>Retry settings</button></div>}

        {/* Message Display */}
        {message && (
          <div role="status" className={`mb-4 p-3 text-sm rounded-lg border flex items-start gap-3 ${
            message.type === 'success'
              ? 'bg-success/10 text-success border-success/20'
              : 'bg-danger/5 text-danger border-danger/20'
          }`}>
            <span>{message.text}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-line mb-4">
          <nav aria-label="Settings sections" className="-mb-px flex gap-5">
            <button
              onClick={() => setActiveTab('profiles')}
              aria-pressed={activeTab === 'profiles'}
              className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === 'profiles'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              Server profiles
            </button>
            <button
              onClick={() => setActiveTab('current')}
              aria-pressed={activeTab === 'current'}
              className={`py-2 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeTab === 'current'
                  ? 'border-accent text-accent'
                  : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              Current configuration
            </button>
          </nav>
        </div>

        {/* Profiles Tab */}
        {activeTab === 'profiles' && multiServerConfig && (
          <div>
            {/* Profile List */}
            <div className="mb-4">
              <div className="flex flex-wrap justify-between items-center gap-3 mb-3">
                <h3 className="text-sm font-semibold text-ink">
                  Saved profiles <span className="font-normal text-muted ml-1">({multiServerConfig.profiles.length})</span>
                </h3>
                <button
                  onClick={() => setShowCreateForm(true)}
                  disabled={saving}
                  className="dev-btn-primary"
                >
                  + Add profile
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {multiServerConfig.profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className={`bg-surface rounded-lg border p-4 ${
                      profile.id === selectedProfileId
                        ? 'border-accent/40'
                        : 'border-line'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1.5">
                          <h4 className="text-sm font-semibold text-ink break-words">
                            {profile.name}
                          </h4>
                          {profile.id === selectedProfileId && (
                            <span className="dev-badge text-xs bg-success/10 text-success border-success/20">
                              Active
                            </span>
                          )}
                        </div>
                        {profile.description && (
                          <p className="text-sm text-muted mb-2">
                            {profile.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
                          <div className="text-muted">
                            <span className="font-semibold text-muted mr-2">Brokers:</span>
                            <span className="font-mono text-ink break-all">{profile.settings.brokers.join(', ')}</span>
                          </div>
                          {profile.lastConnected && (
                            <div className="text-muted">
                              <span className="font-semibold text-muted mr-2">Last connected:</span>
                              {new Date(profile.lastConnected).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2 md:pt-0">
                        {profile.id !== selectedProfileId && (
                          <button
                            onClick={() => handleSwitchProfile(profile.id)}
                            disabled={saving}
                            className="dev-btn"
                          >
                            Connect
                          </button>
                        )}
                        <button
                          onClick={() => handleEditProfile(profile)}
                          disabled={saving}
                          className="dev-btn"
                        >
                          Edit
                        </button>
                        {multiServerConfig.profiles.length > 1 && (
                          <button
                            onClick={() => handleDeleteProfile(profile.id)}
                            disabled={saving}
                            className="dev-btn border-danger/30 text-danger hover:border-danger hover:bg-danger/5"
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
              <div className="dev-card p-4 mt-4">
                <h3 className="text-sm font-semibold text-ink mb-4">
                  {editingProfile ? 'Edit profile' : 'Create profile'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Basic Information */}
                  <div>
                    <label htmlFor="profile-name" className="block text-sm font-medium text-ink mb-2">
                      Profile name <span aria-hidden="true" className="text-muted">*</span>
                    </label>
                    <input
                      id="profile-name"
                      required
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full dev-input"
                      placeholder="e.g. Production cluster"
                    />
                  </div>

                  <div>
                    <label htmlFor="profile-description" className="block text-sm font-medium text-ink mb-2">
                      Description
                    </label>
                    <input
                      id="profile-description"
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full dev-input"
                      placeholder="Optional description"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="profile-brokers" className="block text-sm font-medium text-ink mb-2">
                      Brokers <span aria-hidden="true" className="text-muted">*</span>
                    </label>
                    <input
                      id="profile-brokers"
                      aria-describedby="broker-hint"
                      required
                      type="text"
                      value={formData.brokers}
                      onChange={(e) => setFormData({ ...formData, brokers: e.target.value })}
                      className="w-full dev-input font-mono"
                      placeholder="localhost:9092, broker2:9092"
                    />
                    <p id="broker-hint" className="mt-2 text-xs text-muted">
                      Separate broker addresses with commas.
                    </p>
                  </div>

                  <div>
                    <label htmlFor="profile-client" className="block text-sm font-medium text-ink mb-2">
                      Client ID
                    </label>
                    <input
                      id="profile-client"
                      type="text"
                      value={formData.clientId}
                      onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                      className="w-full dev-input font-mono"
                    />
                  </div>

                  <div>
                    <label htmlFor="profile-app" className="block text-sm font-medium text-ink mb-2">
                      Application name
                    </label>
                    <input
                      id="profile-app"
                      type="text"
                      value={formData.appName}
                      onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
                      className="w-full dev-input"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-4 pt-4 border-t border-line justify-end">
                  <button
                    onClick={cancelForm}
                    disabled={saving}
                    className="dev-btn disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={editingProfile ? handleUpdateProfile : handleCreateProfile}
                    disabled={saving || !formData.name.trim()}
                    className="dev-btn-primary disabled:opacity-50"
                  >
                    {saving ? (
                      <span className="flex items-center">
                        <div className="w-3 h-3 border border-line border-t-accent animate-spin mr-2"></div>
                        Saving...
                      </span>
                    ) : (editingProfile ? 'Update profile' : 'Save profile')}
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
              const activeProfile = multiServerConfig.profiles.find(p => p.id === selectedProfileId);
              return activeProfile ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-semibold text-ink">
                      Active profile:
                    </h3>
                    <span className="dev-badge text-xs">
                      {activeProfile.name}
                    </span>
                  </div>
                  <div className="dev-card p-4">
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      <div className="border-b border-line pb-3">
                        <dt className="text-xs font-semibold text-muted mb-1.5">Brokers</dt>
                        <dd className="text-sm font-mono text-ink break-all">{activeProfile.settings.brokers.join(', ')}</dd>
                      </div>
                      <div className="border-b border-line pb-3">
                        <dt className="text-xs font-semibold text-muted mb-1.5">Client ID</dt>
                        <dd className="text-sm font-mono text-ink break-all">{activeProfile.settings.clientId}</dd>
                      </div>
                      <div className="border-b border-line pb-3">
                        <dt className="text-xs font-semibold text-muted mb-1.5">Connection timeout</dt>
                        <dd className="text-sm text-ink">{activeProfile.settings.connectionTimeout} ms</dd>
                      </div>
                      <div className="border-b border-line pb-3">
                        <dt className="text-xs font-semibold text-muted mb-1.5">Request timeout</dt>
                        <dd className="text-sm text-ink">{activeProfile.settings.requestTimeout} ms</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ) : (
                <div className="text-center px-4 py-10 bg-surface border border-line">
                  <div className="w-10 h-10 bg-subtle border border-line flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-sm font-semibold text-ink mb-1">No active profile</p>
                  <p className="text-xs text-muted">Choose a profile from the Server profiles tab to view its configuration.</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
