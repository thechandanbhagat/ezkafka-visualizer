'use client';

import React, { useState, useEffect } from 'react';
import { MultiServerConfig } from '@/lib/kafka-settings';

interface ServerSelectorProps {
  selectedProfileId?: string;
  onProfileChange: (profileId: string) => void;
  className?: string;
  disabled?: boolean;
}

export default function ServerSelector({ 
  selectedProfileId, 
  onProfileChange, 
  className = '',
  disabled = false 
}: ServerSelectorProps) {
  const [multiServerConfig, setMultiServerConfig] = useState<MultiServerConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/settings');
        const data = await response.json();
        
        if (data.success && data.multiServerConfig) {
          setMultiServerConfig(data.multiServerConfig);
          
          // If no profile is selected, use the active one
          if (!selectedProfileId) {
            onProfileChange(data.multiServerConfig.activeProfileId);
          }
        }
      } catch (error) {
        console.error('Failed to fetch server configuration:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, [selectedProfileId, onProfileChange]);

  if (loading) {
    return (
      <div className={`flex items-center ${className}`}>
        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">Loading servers...</span>
      </div>
    );
  }

  if (!multiServerConfig || multiServerConfig.profiles.length === 0) {
    return (
      <div className={`text-sm text-red-500 ${className}`}>
        No server profiles available
      </div>
    );
  }

  const currentProfileId = selectedProfileId || multiServerConfig.activeProfileId;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Server:
      </label>
      <select
        value={currentProfileId}
        onChange={(e) => onProfileChange(e.target.value)}
        disabled={disabled}
        className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {multiServerConfig.profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
            {profile.id === multiServerConfig.activeProfileId ? ' (Default)' : ''}
          </option>
        ))}
      </select>
      
      {/* Connection status indicator */}
      {(() => {
        const selectedProfile = multiServerConfig.profiles.find(p => p.id === currentProfileId);
        return selectedProfile ? (
          <div className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${
              selectedProfile.id === multiServerConfig.activeProfileId
                ? 'bg-green-500'
                : 'bg-gray-400'
            }`}></div>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {selectedProfile.settings.brokers.join(', ')}
            </span>
          </div>
        ) : null;
      })()}
    </div>
  );
}

// Hook for using server selection in components
export function useServerSelection(initialProfileId?: string) {
  const [selectedProfileId, setSelectedProfileId] = useState<string>(initialProfileId || '');

  return {
    selectedProfileId,
    setSelectedProfileId,
    ServerSelector: (props: Omit<ServerSelectorProps, 'selectedProfileId' | 'onProfileChange'>) => (
      <ServerSelector 
        {...props}
        selectedProfileId={selectedProfileId}
        onProfileChange={setSelectedProfileId}
      />
    )
  };
}