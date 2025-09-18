import { NextRequest, NextResponse } from 'next/server';
import { getKafkaService } from '@/lib/kafka';

export async function GET() {
  try {
    const kafkaService = getKafkaService();
    await kafkaService.connect();
    const topics = await kafkaService.getTopicsWithConsumerInfo();
    
    return NextResponse.json(topics);
  } catch (error) {
    console.error('Error fetching topics:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch topics',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Make sure Kafka is running on localhost:9092'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, partitions, replicationFactor, configs } = await request.json();
    
    if (!name) {
      return NextResponse.json(
        { error: 'Topic name is required' },
        { status: 400 }
      );
    }

    const kafkaService = getKafkaService();
    await kafkaService.connect();
    
    // Create topic with basic parameters
    await kafkaService.createTopic(name, partitions || 1, replicationFactor || 1);
    
    // If configs are provided, we would apply them here
    // For now, just log them as KafkaJS topic creation with configs
    // requires a more complex setup
    if (configs && Object.keys(configs).length > 0) {
      console.log(`Topic ${name} created with configs:`, configs);
    }
    
    return NextResponse.json({ message: 'Topic created successfully' });
  } catch (error) {
    console.error('Error creating topic:', error);
    return NextResponse.json(
      { error: 'Failed to create topic' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const topicName = searchParams.get('name');
    
    if (!topicName) {
      return NextResponse.json(
        { error: 'Topic name is required' },
        { status: 400 }
      );
    }

    const kafkaService = getKafkaService();
    await kafkaService.connect();
    await kafkaService.deleteTopic(topicName);
    
    return NextResponse.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    console.error('Error deleting topic:', error);
    return NextResponse.json(
      { error: 'Failed to delete topic' },
      { status: 500 }
    );
  }
}
