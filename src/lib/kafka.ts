import { Kafka, Producer, Consumer, Admin } from 'kafkajs';

export interface KafkaConfig {
  brokers: string[];
  clientId: string;
  connectionTimeout?: number;
  requestTimeout?: number;
  maxMessageSize?: number;
  retries?: number;
  initialRetryTime?: number;
  acks?: number;
  compressionType?: string;
  batchSize?: number;
  lingerMs?: number;
}

export interface TopicInfo {
  name: string;
  partitions: number;
  replicationFactor: number;
  connectedConsumers?: number;
  consumerGroups?: string[];
  messageCount?: number;
}

export interface ConsumerGroupInfo {
  groupId: string;
  members: number;
  state: string;
  protocol: string;
  subscriptions: string[];
}

export interface TopicConsumerInfo {
  topic: string;
  totalConsumers: number;
  consumerGroups: ConsumerGroupInfo[];
}

export interface MessageInfo {
  topic: string;
  partition: number;
  offset: string;
  timestamp: string;
  key?: string;
  value: string;
  headers?: Record<string, string>;
}

export class KafkaService {
  private kafka: Kafka;
  private admin: Admin;
  private producer?: Producer;
  private consumers: Map<string, Consumer> = new Map();
  private config: KafkaConfig;

  constructor(config: KafkaConfig) {
    this.config = config;
    this.kafka = new Kafka({
      clientId: config.clientId,
      brokers: config.brokers,
      retry: {
        initialRetryTime: config.initialRetryTime || 300,
        retries: config.retries || 3
      },
      connectionTimeout: config.connectionTimeout || 10000,
      requestTimeout: config.requestTimeout || 30000,
    });
    this.admin = this.kafka.admin();
  }

  async connect(): Promise<void> {
    try {
      await this.admin.connect();
      console.log('Connected to Kafka cluster');
    } catch (error) {
      console.error('Failed to connect to Kafka:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.admin.disconnect();
      if (this.producer) {
        await this.producer.disconnect();
      }
      for (const consumer of this.consumers.values()) {
        await consumer.disconnect();
      }
      this.consumers.clear();
      console.log('Disconnected from Kafka cluster');
    } catch (error) {
      console.error('Error disconnecting from Kafka:', error);
    }
  }

  async getTopics(): Promise<TopicInfo[]> {
    try {
      const topics = await this.admin.listTopics();
      const metadata = await this.admin.fetchTopicMetadata({ topics });
      
      return metadata.topics.map(topic => ({
        name: topic.name,
        partitions: topic.partitions.length,
        replicationFactor: topic.partitions[0]?.replicas.length || 0,
      }));
    } catch (error) {
      console.error('Error fetching topics:', error);
      throw error;
    }
  }

  async createTopic(name: string, partitions: number = 1, replicationFactor: number = 1): Promise<void> {
    try {
      await this.admin.createTopics({
        topics: [{
          topic: name,
          numPartitions: partitions,
          replicationFactor,
        }],
      });
      console.log(`Topic ${name} created successfully`);
    } catch (error) {
      console.error(`Error creating topic ${name}:`, error);
      throw error;
    }
  }

  async deleteTopic(name: string): Promise<void> {
    try {
      await this.admin.deleteTopics({
        topics: [name],
      });
      console.log(`Topic ${name} deleted successfully`);
    } catch (error) {
      console.error(`Error deleting topic ${name}:`, error);
      throw error;
    }
  }

  async getProducer(): Promise<Producer> {
    if (!this.producer) {
      this.producer = this.kafka.producer({
        // Note: maxMessageBytes is set at the broker level, not producer level
        // Most producer-specific configurations are set per send request
      });
      await this.producer.connect();
    }
    return this.producer;
  }

  async sendMessage(topic: string, message: { key?: string; value: string; headers?: Record<string, string> }): Promise<void> {
    try {
      const producer = await this.getProducer();
      
      // Map compression types to KafkaJS enum values
      const compressionMap: Record<string, number | undefined> = {
        'none': undefined,
        'gzip': 1,
        'snappy': 2,
        'lz4': 3,
        'zstd': 4
      };
      
      await producer.send({
        topic,
        messages: [message],
        acks: this.config.acks || 1,
        compression: compressionMap[this.config.compressionType || 'none'],
        timeout: this.config.requestTimeout || 30000,
      });
      console.log(`Message sent to topic ${topic}`);
    } catch (error) {
      console.error(`Error sending message to topic ${topic}:`, error);
      throw error;
    }
  }

  async createConsumer(groupId: string, topics: string[]): Promise<Consumer> {
    try {
      const consumer = this.kafka.consumer({ groupId });
      await consumer.connect();
      await consumer.subscribe({ topics, fromBeginning: false });
      
      this.consumers.set(groupId, consumer);
      return consumer;
    } catch (error) {
      console.error(`Error creating consumer for group ${groupId}:`, error);
      throw error;
    }
  }

  async consumeMessages(topics: string[], groupId: string = 'ezkafka-consumer-group', maxMessages: number = 10, timeoutMs: number = 5000, fromBeginning: boolean = false): Promise<MessageInfo[]> {
    const messages: MessageInfo[] = [];
    let consumer: Consumer | null = null;
    
    try {
      consumer = this.kafka.consumer({ groupId });
      await consumer.connect();
      await consumer.subscribe({ topics, fromBeginning });

      // IMPORTANT: Await the run/collect promise so finally executes AFTER completion
      const result = await new Promise<MessageInfo[]>((resolve, reject) => {
        let messageCount = 0;
        let resolved = false;
        
        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            resolve(messages);
          }
        }, timeoutMs);
        
        consumer!.run({
          eachMessage: async ({ topic, partition, message, heartbeat }) => {
            try {
              await heartbeat();
              
              if (resolved) return;
              
              const messageInfo: MessageInfo = {
                topic,
                partition,
                offset: message.offset,
                timestamp: message.timestamp ? new Date(parseInt(message.timestamp)).toISOString() : new Date().toISOString(),
                key: message.key ? message.key.toString() : undefined,
                value: message.value ? message.value.toString() : '',
                headers: message.headers ? Object.fromEntries(
                  Object.entries(message.headers).map(([key, value]) => [
                    key,
                    value ? value.toString() : ''
                  ])
                ) : undefined
              };
              
              messages.push(messageInfo);
              messageCount++;
              
              // If we've collected enough messages, resolve early
              if (messageCount >= maxMessages && !resolved) {
                resolved = true;
                clearTimeout(timeout);
                resolve(messages);
              }
            } catch (error) {
              if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(error);
              }
            }
          },
        }).catch((error) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timeout);
            reject(error);
          }
        });
      });

      // Cleanly stop the consumer after collection
  try { await consumer.stop(); } catch { /* noop */ }
      return result;
    } catch (error) {
      console.error(`Error consuming messages from topics ${topics.join(', ')}:`, error);
      throw error;
    } finally {
      if (consumer) {
        try {
          // Ensure the runner is stopped before disconnect
          await consumer.stop();
        } catch { /* noop */ }
        try {
          await consumer.disconnect();
        } catch (error) {
          console.error('Error disconnecting consumer:', error);
        }
      }
    }
  }

  async getClusterInfo(): Promise<{ topics: number; metadata: unknown }> {
    try {
      const metadata = await this.admin.fetchTopicMetadata();
      return {
        topics: metadata.topics.length,
        metadata: metadata.topics,
      };
    } catch (error) {
      console.error('Error fetching cluster info:', error);
      throw error;
    }
  }

  async getConsumerGroups(): Promise<ConsumerGroupInfo[]> {
    try {
      const groups = await this.admin.listGroups();
      const groupDetails = await Promise.all(
        groups.groups.map(async (group) => {
          try {
            const description = await this.admin.describeGroups([group.groupId]);
            const groupInfo = description.groups[0];
            
            return {
              groupId: group.groupId,
              members: groupInfo.members.length,
              state: groupInfo.state,
              protocol: groupInfo.protocol,
              subscriptions: [...new Set(groupInfo.members.flatMap(member => 
                member.memberAssignment ? Object.keys(member.memberAssignment) : []
              ))]
            };
          } catch (error) {
            console.error(`Error describing group ${group.groupId}:`, error);
            return {
              groupId: group.groupId,
              members: 0,
              state: 'unknown',
              protocol: 'unknown',
              subscriptions: []
            };
          }
        })
      );
      
      return groupDetails;
    } catch (error) {
      console.error('Error fetching consumer groups:', error);
      return [];
    }
  }

  async getTopicConsumerInfo(topicName: string): Promise<TopicConsumerInfo> {
    try {
      const consumerGroups = await this.getConsumerGroups();
      const relevantGroups = consumerGroups.filter(group => 
        group.subscriptions.includes(topicName)
      );
      
      const totalConsumers = relevantGroups.reduce((sum, group) => sum + group.members, 0);
      
      return {
        topic: topicName,
        totalConsumers,
        consumerGroups: relevantGroups
      };
    } catch (error) {
      console.error(`Error getting consumer info for topic ${topicName}:`, error);
      return {
        topic: topicName,
        totalConsumers: 0,
        consumerGroups: []
      };
    }
  }

  async getTopicsWithConsumerInfo(): Promise<TopicInfo[]> {
    try {
      const topics = await this.admin.listTopics();
      const metadata = await this.admin.fetchTopicMetadata({ topics });
      const consumerGroups = await this.getConsumerGroups();
      
      return await Promise.all(metadata.topics.map(async (topic) => {
        const relevantGroups = consumerGroups.filter(group => 
          group.subscriptions.includes(topic.name)
        );
        
        const connectedConsumers = relevantGroups.reduce((sum, group) => sum + group.members, 0);
        let messageCount: number | undefined = undefined;
        try {
          type PartitionOffset = { partition: number; offset?: string; high?: string; low?: string };
          const offsets: PartitionOffset[] = await this.admin.fetchTopicOffsets(topic.name) as unknown as PartitionOffset[];
          messageCount = offsets.reduce((sum, p: PartitionOffset) => {
            const high = parseInt((p.high ?? p.offset ?? '0') as string, 10);
            const low = parseInt((p.low ?? '0') as string, 10);
            const delta = high - low;
            return sum + (isNaN(delta) ? 0 : Math.max(0, delta));
          }, 0);
        } catch (err) {
          console.warn(`Could not fetch offsets for topic ${topic.name}:`, err);
        }
        
        return {
          name: topic.name,
          partitions: topic.partitions.length,
          replicationFactor: topic.partitions[0]?.replicas.length || 0,
          connectedConsumers,
          consumerGroups: relevantGroups.map(g => g.groupId),
          messageCount,
        };
      }));
    } catch (error) {
      console.error('Error fetching topics with consumer info:', error);
      throw error;
    }
  }
}

// Singleton instance
let kafkaService: KafkaService | null = null;

export function getKafkaService(): KafkaService {
  if (!kafkaService) {
    kafkaService = new KafkaService({
      clientId: 'ezkafka-visualizer',
      brokers: ['localhost:9092'],
    });
  }
  return kafkaService;
}

export function createKafkaServiceWithSettings(settings: KafkaConfig): KafkaService {
  kafkaService = new KafkaService(settings);
  return kafkaService;
}

export async function reinitializeKafkaService(): Promise<KafkaService> {
  try {
    // Fetch current settings from API
    const response = await fetch('/api/settings');
    if (response.ok) {
      const data = await response.json();
      if (data.success) {
        const settings = data.settings;
        kafkaService = new KafkaService(settings);
        return kafkaService;
      }
    }
  } catch (error) {
    console.warn('Could not fetch settings, using defaults:', error);
  }
  
  // Fallback to default configuration
  return getKafkaService();
}
