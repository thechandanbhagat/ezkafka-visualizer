'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { MultiServerConfig, KafkaServerProfile, DEFAULT_MULTI_SERVER_CONFIG } from '@/lib/kafka-settings';

interface ServerContextType {
  multiServerConfig: MultiServerConfig | null;
  activeProfile: KafkaServerProfile | null;
  selectedProfileId: string;
  isLoading: boolean;
  error: string | null;
  setSelectedProfileId: (profileId: string) => void;
  refreshConfig: () => Promise<void>;
  switchProfile: (profileId: string) => Promise<void>;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

interface ServerProviderProps {
  children: ReactNode;
}

export function ServerProvider({ children }: ServerProviderProps) {
  const [multiServerConfig, setMultiServerConfig] = useState<MultiServerConfig | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeProfile = multiServerConfig?.profiles.find(p => p.id === selectedProfileId) || null;

  const refreshConfig = async () => {
    try {
      setError(null);
      const response = await fetch('/api/settings');
      const data = await response.json();
      
      if (data.success && data.multiServerConfig) {
        setMultiServerConfig(data.multiServerConfig);
        
        // If no profile is selected, use the active one from config
        if (!selectedProfileId && data.multiServerConfig.activeProfileId) {
          setSelectedProfileId(data.multiServerConfig.activeProfileId);
        }
      } else {
        throw new Error('Failed to load server configuration');
      }
    } catch (err) {
      console.error('Failed to fetch server configuration:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      
      // Fallback to default config
      setMultiServerConfig(DEFAULT_MULTI_SERVER_CONFIG);
      setSelectedProfileId(DEFAULT_MULTI_SERVER_CONFIG.activeProfileId);
    } finally {
      setIsLoading(false);
    }
  };

  const switchProfile = async (profileId: string) => {
    try {
      setError(null);
      
      // Optimistically update the selected profile
      setSelectedProfileId(profileId);
      
      // Update the server configuration
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
      } else {
        throw new Error(result.error || 'Failed to switch profile');
      }
    } catch (err) {
      console.error('Failed to switch profile:', err);
      setError(err instanceof Error ? err.message : 'Failed to switch profile');
      
      // Revert on error
      if (multiServerConfig) {
        setSelectedProfileId(multiServerConfig.activeProfileId);
      }
    }
  };

  useEffect(() => {
    refreshConfig();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const contextValue: ServerContextType = {
    multiServerConfig,
    activeProfile,
    selectedProfileId,
    isLoading,
    error,
    setSelectedProfileId,
    refreshConfig,
    switchProfile,
  };

  return (
    <ServerContext.Provider value={contextValue}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  const context = useContext(ServerContext);
  if (context === undefined) {
    throw new Error('useServer must be used within a ServerProvider');
  }
  return context;
}

// Convenience hook for getting the current profile ID for API calls
export function useActiveProfileId(): string {
  const { selectedProfileId } = useServer();
  return selectedProfileId;
}