import { NextResponse } from 'next/server';
import { getKafkaService } from '@/lib/kafka';

export async function GET() {
  try {
    const kafkaService = getKafkaService();
    await kafkaService.connect();
    const consumerGroups = await kafkaService.getConsumerGroups();
    
    return NextResponse.json(consumerGroups);
  } catch (error) {
    console.error('Error fetching consumer groups:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fetch consumer groups',
        message: error instanceof Error ? error.message : 'Unknown error',
        details: 'Make sure Kafka is running on localhost:9092'
      },
      { status: 500 }
    );
  }
}
