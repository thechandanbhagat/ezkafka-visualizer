import { NextResponse } from 'next/server';
import { getKafkaService } from '@/lib/kafka';

export async function GET() {
  try {
    const kafkaService = getKafkaService();
    await kafkaService.connect();
    const clusterInfo = await kafkaService.getClusterInfo();
    
    return NextResponse.json(clusterInfo);
  } catch (error) {
    console.error('Error fetching cluster info:', error);
    return NextResponse.json(
      { error: 'Failed to fetch cluster info' },
      { status: 500 }
    );
  }
}
