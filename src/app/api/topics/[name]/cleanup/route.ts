import { NextRequest, NextResponse } from 'next/server';
import { getKafkaService } from '@/lib/kafka';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get('profileId') || undefined;
    const { name: topicName } = await params;

    if (!topicName) {
      return NextResponse.json(
        { error: 'Topic name is required' },
        { status: 400 }
      );
    }

    const kafkaService = getKafkaService(profileId);
    await kafkaService.connect();
    
    const result = await kafkaService.cleanupMessages(topicName);
    
    return NextResponse.json({
      message: 'Messages cleaned up successfully',
      deletedPartitions: result.deletedPartitions,
      totalMessages: result.totalMessages
    });
  } catch (error) {
    console.error('Error cleaning up messages:', error);
    return NextResponse.json(
      { 
        error: 'Failed to cleanup messages',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
