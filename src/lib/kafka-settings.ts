// @group Types : Shared cluster profile and client settings contracts

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

// @group Constants : Message size presets and initial local cluster configuration
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
