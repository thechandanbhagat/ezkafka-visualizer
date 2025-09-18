import { NextRequest, NextResponse } from 'next/server';
import { KafkaService } from '@/lib/kafka';

const kafkaService = new KafkaService({
  clientId: 'kafka-visualizer-config',
  brokers: ['localhost:9092'],
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    await kafkaService.connect();

    // For now, return a mock configuration since KafkaJS describeConfigs
    // requires specific setup. In a real implementation, you'd use:
    // const configs = await admin.describeConfigs({...})
    
    console.log(`Fetching config for topic: ${name}`);
    
    const mockConfig = {
      'cleanup.policy': 'delete',
      'compression.type': 'producer',
      'delete.retention.ms': '86400000',
      'file.delete.delay.ms': '60000',
      'flush.messages': '9223372036854775807',
      'flush.ms': '9223372036854775807',
      'follower.replication.throttled.replicas': '',
      'index.interval.bytes': '4096',
      'leader.replication.throttled.replicas': '',
      'max.compaction.lag.ms': '9223372036854775807',
      'max.message.bytes': '1048588',
      'message.format.version': '3.0-IV1',
      'message.timestamp.difference.max.ms': '9223372036854775807',
      'message.timestamp.type': 'CreateTime',
      'min.cleanable.dirty.ratio': '0.5',
      'min.compaction.lag.ms': '0',
      'min.insync.replicas': '1',
      'preallocate': 'false',
      'retention.bytes': '-1',
      'retention.ms': '604800000',
      'segment.bytes': '1073741824',
      'segment.index.bytes': '10485760',
      'segment.jitter.ms': '0',
      'segment.ms': '604800000',
      'unclean.leader.election.enable': 'false'
    };

    await kafkaService.disconnect();
    return NextResponse.json(mockConfig);
  } catch (error) {
    console.error('Error fetching topic config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch topic configuration' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await request.json();
    await kafkaService.connect();

    // For now, simulate config update
    // In a real implementation, you'd use:
    // await admin.alterConfigs({...})
    
    console.log(`Updating config for topic ${name}:`, body);
    
    await kafkaService.disconnect();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating topic config:', error);
    return NextResponse.json(
      { error: 'Failed to update topic configuration' },
      { status: 500 }
    );
  }
}
