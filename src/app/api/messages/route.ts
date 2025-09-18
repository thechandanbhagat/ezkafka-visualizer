import { NextRequest, NextResponse } from 'next/server';
import { getKafkaService } from '@/lib/kafka';

export async function POST(request: NextRequest) {
  try {
    const { topic, key, value, headers } = await request.json();
    
    if (!topic || !value) {
      return NextResponse.json(
        { error: 'Topic and value are required' },
        { status: 400 }
      );
    }

    const kafkaService = getKafkaService();
    await kafkaService.connect();
    await kafkaService.sendMessage(topic, { key, value, headers });
    
    return NextResponse.json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending message:', error);
    return NextResponse.json(
      { error: 'Failed to send message' },
      { status: 500 }
    );
  }
}
