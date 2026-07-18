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
      <div className="dev-card p-12">
        <div className="flex flex-col items-center justify-center">
          <div className="w-12 h-12 rounded-none border border-zinc-800 border-t-emerald-500 animate-spin mb-4"></div>
          <span className="text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest">LOADING_SETTINGS...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dev-card">
      <div className="p-8">
        <h2 className="text-lg font-bold font-mono text-zinc-100 mb-6 tracking-tight uppercase">
          KAFKA_SERVER_CONFIGURATION
        </h2>

        {/* Message Display */}
        {message && (
          <div className={`mb-6 p-4 font-mono text-xs font-bold uppercase tracking-widest border flex items-start gap-3 ${
            message.type === 'success' 
              ? 'bg-emerald-950/30 text-emerald-400 border-emerald-900'
              : 'bg-red-950/30 text-red-400 border-red-900'
          }`}>
            <span className="mt-0.5">{message.type === 'success' ? '[SUCCESS]' : '[ERROR]'}</span>
            <span>{message.text}</span>
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-zinc-800 mb-8">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('profiles')}
              className={`py-3 px-1 border-b-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors ${
                activeTab === 'profiles'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              SERVER_PROFILES
            </button>
            <button
              onClick={() => setActiveTab('current')}
              className={`py-3 px-1 border-b-2 font-mono text-xs font-bold uppercase tracking-widest transition-colors ${
                activeTab === 'current'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-transparent text-zinc-500 hover:text-zinc-300'
              }`}
            >
              CURRENT_CONFIGURATION
            </button>
          </nav>
        </div>

        {/* Profiles Tab */}
        {activeTab === 'profiles' && multiServerConfig && (
          <div>
            {/* Profile List */}
            <div className="mb-8">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-sm font-bold font-mono text-zinc-100 uppercase tracking-widest">
                  SAVED_PROFILES <span className="text-emerald-500 ml-2">[{multiServerConfig.profiles.length}]</span>
                </h3>
                <button
                  onClick={() => setShowCreateForm(true)}
                  disabled={saving}
                  className="dev-btn-primary"
                >
                  + ADD_NEW_PROFILE
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {multiServerConfig.profiles.map((profile) => (
                  <div
                    key={profile.id}
                    className={`bg-black border transition-all duration-200 p-5 ${
                      profile.id === multiServerConfig.activeProfileId
                        ? 'border-emerald-500'
                        : 'border-zinc-800 hover:border-zinc-600'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className={`text-sm font-mono font-bold uppercase tracking-widest ${profile.id === multiServerConfig.activeProfileId ? 'text-emerald-400' : 'text-zinc-100'}`}>
                            {profile.name}
                          </h4>
                          {profile.id === multiServerConfig.activeProfileId && (
                            <span className="dev-badge text-[10px]">
                              ACTIVE
                            </span>
                          )}
                        </div>
                        {profile.description && (
                          <p className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest mb-3">
                            {profile.description}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[10px] font-mono uppercase tracking-widest">
                          <div className="text-zinc-500">
                            <span className="font-bold text-zinc-400 mr-2">BROKERS:</span> 
                            <span className="bg-zinc-950 border border-zinc-800 px-2 py-0.5">{profile.settings.brokers.join(', ')}</span>
                          </div>
                          {profile.lastConnected && (
                            <div className="text-zinc-500">
                              <span className="font-bold text-zinc-400 mr-2">LAST_CONNECTED:</span> 
                              {new Date(profile.lastConnected).toLocaleString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2 md:pt-0">
                        {profile.id !== multiServerConfig.activeProfileId && (
                          <button
                            onClick={() => handleSwitchProfile(profile.id)}
                            disabled={saving}
                            className="dev-btn"
                          >
                            CONNECT
                          </button>
                        )}
                        <button
                          onClick={() => handleEditProfile(profile)}
                          disabled={saving}
                          className="dev-btn"
                        >
                          EDIT
                        </button>
                        {multiServerConfig.profiles.length > 1 && (
                          <button
                            onClick={() => handleDeleteProfile(profile.id)}
                            disabled={saving}
                            className="dev-btn border-red-500/30 text-red-400 hover:border-red-500 hover:bg-red-950/30"
                          >
                            DELETE
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
              <div className="border-t border-zinc-800 pt-8 mt-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <h3 className="text-sm font-bold font-mono text-zinc-100 uppercase tracking-widest mb-6">
                  {editingProfile ? 'EDIT_PROFILE_SETTINGS' : 'CREATE_NEW_PROFILE'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6 bg-black border border-zinc-800">
                  {/* Basic Information */}
                  <div>
                    <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">
                      PROFILE_NAME <span className="text-emerald-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full dev-input"
                      placeholder="E.G. PRODUCTION_KAFKA"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">
                      DESCRIPTION
                    </label>
                    <input
                      type="text"
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className="w-full dev-input"
                      placeholder="OPTIONAL DESCRIPTION"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">
                      BROKERS <span className="text-emerald-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.brokers}
                      onChange={(e) => setFormData({ ...formData, brokers: e.target.value })}
                      className="w-full dev-input"
                      placeholder="LOCALHOST:9092, BROKER2:9092"
                    />
                    <p className="mt-2 text-[10px] font-mono uppercase tracking-widest text-zinc-600 flex items-center gap-1.5">
                      <span className="w-1 h-1 bg-zinc-600"></span> COMMA-SEPARATED LIST OF BROKER ADDRESSES
                    </p>
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">
                      CLIENT_ID
                    </label>
                    <input
                      type="text"
                      value={formData.clientId}
                      onChange={(e) => setFormData({ ...formData, clientId: e.target.value })}
                      className="w-full dev-input"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-mono font-bold text-zinc-500 uppercase tracking-widest mb-2">
                      APPLICATION_NAME
                    </label>
                    <input
                      type="text"
                      value={formData.appName}
                      onChange={(e) => setFormData({ ...formData, appName: e.target.value })}
                      className="w-full dev-input"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-4 mt-6 justify-end">
                  <button
                    onClick={cancelForm}
                    disabled={saving}
                    className="dev-btn disabled:opacity-50"
                  >
                    CANCEL
                  </button>
                  <button
                    onClick={editingProfile ? handleUpdateProfile : handleCreateProfile}
                    disabled={saving || !formData.name.trim()}
                    className="dev-btn-primary disabled:opacity-50"
                  >
                    {saving ? (
                      <span className="flex items-center">
                        <div className="w-3 h-3 border border-zinc-800 border-t-emerald-500 animate-spin mr-2"></div>
                        SAVING...
                      </span>
                    ) : (editingProfile ? 'UPDATE_PROFILE' : 'SAVE_PROFILE')}
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
                <div className="animate-in fade-in duration-300">
                  <div className="flex items-center gap-3 mb-6">
                    <h3 className="text-sm font-bold font-mono text-zinc-100 uppercase tracking-widest">
                      ACTIVE_PROFILE:
                    </h3>
                    <span className="dev-badge text-[10px]">
                      {activeProfile.name}
                    </span>
                  </div>
                  <div className="bg-black border border-zinc-800 p-6">
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                      <div className="border-b border-zinc-900 pb-4">
                        <dt className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500 mb-1.5">BROKERS</dt>
                        <dd className="font-mono text-xs text-zinc-300">{activeProfile.settings.brokers.join(', ')}</dd>
                      </div>
                      <div className="border-b border-zinc-900 pb-4">
                        <dt className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500 mb-1.5">CLIENT_ID</dt>
                        <dd className="font-mono text-xs text-zinc-300">{activeProfile.settings.clientId}</dd>
                      </div>
                      <div className="border-b border-zinc-900 pb-4">
                        <dt className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500 mb-1.5">CONNECTION_TIMEOUT</dt>
                        <dd className="font-mono text-xs text-zinc-300">{activeProfile.settings.connectionTimeout}MS</dd>
                      </div>
                      <div className="border-b border-zinc-900 pb-4">
                        <dt className="text-[10px] font-mono font-bold uppercase tracking-widest text-zinc-500 mb-1.5">REQUEST_TIMEOUT</dt>
                        <dd className="font-mono text-xs text-zinc-300">{activeProfile.settings.requestTimeout}MS</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ) : (
                <div className="text-center py-16 bg-black border border-zinc-800">
                  <div className="w-16 h-16 bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-sm font-mono font-bold uppercase tracking-widest text-zinc-300 mb-1">NO_ACTIVE_PROFILE</p>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-zinc-500">PLEASE SWITCH TO A PROFILE IN THE SERVER PROFILES TAB</p>
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}