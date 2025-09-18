import { NextRequest, NextResponse } from 'next/server';
import { getKafkaService } from '@/lib/kafka';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  try {
    const { name } = await params;
    const kafkaService = getKafkaService();
    await kafkaService.connect();
    await kafkaService.deleteTopic(name);
    
    return NextResponse.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    console.error('Error deleting topic:', error);
    return NextResponse.json(
      { error: 'Failed to delete topic' },
      { status: 500 }
    );
  }
}
