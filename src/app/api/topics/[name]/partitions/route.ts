import { NextRequest, NextResponse } from 'next/server';
import { KafkaService } from '@/lib/kafka';

const kafkaService = new KafkaService({
  clientId: 'kafka-visualizer-partitions',
  brokers: ['localhost:9092'],
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const body = await request.json();
    const { count } = body;

    if (!count || count < 1) {
      return NextResponse.json(
        { error: 'Invalid partition count' },
        { status: 400 }
      );
    }

    await kafkaService.connect();

    // For now, simulate partition addition
    // In a real implementation, you'd use:
    // await admin.createPartitions({
    //   topicPartitions: [{
    //     topic: name,
    //     count: count
    //   }]
    // });
    
    console.log(`Adding partitions to topic ${name}: ${count}`);
    
    await kafkaService.disconnect();
    return NextResponse.json({ success: true, newPartitionCount: count });
  } catch (error) {
    console.error('Error adding partitions:', error);
    return NextResponse.json(
      { error: 'Failed to add partitions' },
      { status: 500 }
    );
  }
}
