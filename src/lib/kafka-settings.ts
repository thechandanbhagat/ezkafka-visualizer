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
