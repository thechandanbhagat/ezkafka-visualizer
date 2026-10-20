import { NextRequest, NextResponse } from 'next/server';
import { getKafkaService, validateTopicName } from '@/lib/kafka';
import { readTopicProfileId, topicApiError } from '../../topic-api';

// @group APIEndpoints > Purge : Delete records up to a captured offset without recreating the topic
export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    validateTopicName(name);
    const service = await getKafkaService(readTopicProfileId(request, true));
    await service.connect();
    const result = await service.cleanupMessages(name);
    return NextResponse.json({ message: 'Records purged up to the captured partition offsets', ...result });
  } catch (error) {
    return topicApiError(error, 'Failed to purge records. Check the selected Kafka cluster.');
  }
}
