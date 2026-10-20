import { NextRequest, NextResponse } from 'next/server';
import { getKafkaService, validatePartitionCount, validateRequestBody, validateTopicName } from '@/lib/kafka';
import { readTopicProfileId, topicApiError } from '../../topic-api';

// @group APIEndpoints > Partitions : Increase the total partition count on the requested cluster
export async function POST(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    validateTopicName(name);
    const body: unknown = await request.json();
    validateRequestBody(body);
    validatePartitionCount(body.count);
    const service = await getKafkaService(readTopicProfileId(request, true));
    await service.connect();
    await service.addPartitions(name, body.count);
    return NextResponse.json({ success: true, newPartitionCount: body.count });
  } catch (error) {
    return topicApiError(error, 'Failed to add partitions. Check the selected Kafka cluster.');
  }
}
