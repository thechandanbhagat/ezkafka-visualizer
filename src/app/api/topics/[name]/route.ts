import { NextRequest, NextResponse } from 'next/server';
import { getKafkaService, validateTopicName } from '@/lib/kafka';
import { readTopicProfileId, topicApiError } from '../topic-api';

// @group APIEndpoints > Topics : Delete a topic on the requested profile
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    validateTopicName(name);
    const service = await getKafkaService(readTopicProfileId(request, true));
    await service.connect();
    await service.deleteTopic(name);
    return NextResponse.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    return topicApiError(error, 'Failed to delete topic. Check the selected Kafka cluster.');
  }
}
