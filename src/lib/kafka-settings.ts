// Kafka settings types and utilities

export interface KafkaSettings {
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

export interface KafkaServerProfile {
  id: string;
  name: string;
  description?: string;
  settings: KafkaSettings;
  isActive?: boolean;
  lastConnected?: string;
}

export interface MultiServerConfig {
  profiles: KafkaServerProfile[];
  activeProfileId: string;
}

// Predefined message size options (in bytes)
export const MESSAGE_SIZE_PRESETS = {
  tiny: 1024,        // 1KB
  small: 10240,      // 10KB
  medium: 102400,    // 100KB
  large: 1048576,    // 1MB
  xlarge: 10485760,  // 10MB
  xxlarge: 52428800, // 50MB
  max: 104857600     // 100MB
};

export const DEFAULT_SETTINGS: KafkaSettings = {
  brokers: ['localhost:9092'],
  clientId: 'ezkafka-visualizer',
  appName: 'EZ Kafka Visualizer',
  connectionTimeout: 10000,
  requestTimeout: 30000,
  maxMessageSize: MESSAGE_SIZE_PRESETS.large, // 1MB default
  retries: 3,
  initialRetryTime: 300,
  acks: 1,
  compressionType: 'none',
  batchSize: 16384, // 16KB
  lingerMs: 0
};

export const DEFAULT_LOCAL_PROFILE: KafkaServerProfile = {
  id: 'local',
  name: 'Local Kafka',
  description: 'Local Kafka instance running on localhost:9092',
  settings: DEFAULT_SETTINGS,
  isActive: true,
  lastConnected: undefined
};

export const DEFAULT_MULTI_SERVER_CONFIG: MultiServerConfig = {
  profiles: [DEFAULT_LOCAL_PROFILE],
  activeProfileId: 'local'
};

// Validate and sanitize settings
export function validateSettings(settings: Partial<KafkaSettings>): Partial<KafkaSettings> {
  const validated: Partial<KafkaSettings> = {};
  
  if (settings.brokers && Array.isArray(settings.brokers)) {
    validated.brokers = settings.brokers.filter(broker => 
      typeof broker === 'string' && broker.trim().length > 0
    );
  }
  
  if (settings.clientId && typeof settings.clientId === 'string') {
    validated.clientId = settings.clientId.trim();
  }
  if (typeof settings.appName === 'string') {
    const v = settings.appName.trim();
    validated.appName = v.length > 0 ? v : 'EZ Kafka Visualizer';
  }
  
  if (settings.connectionTimeout && typeof settings.connectionTimeout === 'number') {
    validated.connectionTimeout = Math.max(1000, Math.min(60000, settings.connectionTimeout));
  }
  
  if (settings.requestTimeout && typeof settings.requestTimeout === 'number') {
    validated.requestTimeout = Math.max(1000, Math.min(300000, settings.requestTimeout));
  }
  
  if (settings.maxMessageSize && typeof settings.maxMessageSize === 'number') {
    validated.maxMessageSize = Math.max(1024, Math.min(MESSAGE_SIZE_PRESETS.max, settings.maxMessageSize));
  }
  
  if (settings.retries && typeof settings.retries === 'number') {
    validated.retries = Math.max(0, Math.min(10, settings.retries));
  }
  
  if (settings.initialRetryTime && typeof settings.initialRetryTime === 'number') {
    validated.initialRetryTime = Math.max(100, Math.min(10000, settings.initialRetryTime));
  }
  
  if (typeof settings.acks === 'number') {
    validated.acks = [-1, 0, 1].includes(settings.acks) ? settings.acks : 1;
  }
  
  if (settings.compressionType && typeof settings.compressionType === 'string') {
    validated.compressionType = ['none', 'gzip', 'snappy', 'lz4'].includes(settings.compressionType) 
      ? settings.compressionType 
      : 'none';
  }
  
  if (settings.batchSize && typeof settings.batchSize === 'number') {
    validated.batchSize = Math.max(1, Math.min(1000000, settings.batchSize));
  }
  
  if (settings.lingerMs && typeof settings.lingerMs === 'number') {
    validated.lingerMs = Math.max(0, Math.min(60000, settings.lingerMs));
  }
  
  return validated;
}

// Multi-server configuration utilities
export function createServerProfile(
  name: string,
  settings: Partial<KafkaSettings>,
  description?: string
): KafkaServerProfile {
  const id = generateProfileId(name);
  const validatedSettings = { ...DEFAULT_SETTINGS, ...validateSettings(settings) };
  
  return {
    id,
    name: name.trim(),
    description,
    settings: validatedSettings,
    isActive: false,
    lastConnected: undefined
  };
}

export function generateProfileId(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
}

export function validateMultiServerConfig(config: Partial<MultiServerConfig>): MultiServerConfig {
  let profiles = DEFAULT_MULTI_SERVER_CONFIG.profiles;
  let activeProfileId = DEFAULT_MULTI_SERVER_CONFIG.activeProfileId;

  if (config.profiles && Array.isArray(config.profiles) && config.profiles.length > 0) {
    profiles = config.profiles.map(profile => ({
      ...profile,
      settings: { ...DEFAULT_SETTINGS, ...validateSettings(profile.settings) }
    }));
  }

  if (config.activeProfileId && 
      typeof config.activeProfileId === 'string' && 
      profiles.some(p => p.id === config.activeProfileId)) {
    activeProfileId = config.activeProfileId;
  }

  return { profiles, activeProfileId };
}

export function getActiveProfile(config: MultiServerConfig): KafkaServerProfile | null {
  return config.profiles.find(p => p.id === config.activeProfileId) || null;
}

export function updateProfileLastConnected(
  config: MultiServerConfig, 
  profileId: string
): MultiServerConfig {
  const updatedProfiles = config.profiles.map(profile => 
    profile.id === profileId 
      ? { ...profile, lastConnected: new Date().toISOString() }
      : profile
  );
  
  return { ...config, profiles: updatedProfiles };
}

export function addOrUpdateProfile(
  config: MultiServerConfig,
  profile: KafkaServerProfile
): MultiServerConfig {
  const existingIndex = config.profiles.findIndex(p => p.id === profile.id);
  const updatedProfiles = [...config.profiles];
  
  if (existingIndex >= 0) {
    updatedProfiles[existingIndex] = profile;
  } else {
    updatedProfiles.push(profile);
  }
  
  return { ...config, profiles: updatedProfiles };
}

export function removeProfile(config: MultiServerConfig, profileId: string): MultiServerConfig {
  if (config.profiles.length <= 1) {
    throw new Error('Cannot remove the last remaining profile');
  }
  
  const updatedProfiles = config.profiles.filter(p => p.id !== profileId);
  let activeProfileId = config.activeProfileId;
  
  // If we're removing the active profile, switch to the first remaining one
  if (activeProfileId === profileId) {
    activeProfileId = updatedProfiles[0]?.id || '';
  }
  
  return { profiles: updatedProfiles, activeProfileId };
}
