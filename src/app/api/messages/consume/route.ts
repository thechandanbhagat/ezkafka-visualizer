import { NextRequest, NextResponse } from 'next/server';
import { getKafkaService } from '@/lib/kafka';

export async function POST(request: NextRequest) {
  try {
    // Handle empty request body
    let requestData;
    try {
      const text = await request.text();
      if (!text.trim()) {
        return NextResponse.json([]);
      }
      requestData = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    const { topics, groupId = 'ezkafka-consumer-group', maxMessages = 10, fromBeginning = false, profileId } = requestData;
    
    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return NextResponse.json(
        { error: 'Topics array is required' },
        { status: 400 }
      );
    }

    const kafkaService = getKafkaService(profileId);
    await kafkaService.connect();
    
    // Use the new consumeMessages method
    const messages = await kafkaService.consumeMessages(topics, groupId, maxMessages, 5000, fromBeginning);
    
    return NextResponse.json(messages);
  } catch (error) {
    console.error('Error consuming messages:', error);
    return NextResponse.json(
      { 
        error: 'Failed to consume messages',
        message: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
