import { NextRequest, NextResponse } from 'next/server';
import { getKafkaService, KafkaOperationError, validatePartitionCount, validateSelectedProfileId, validateRequestBody, validateTopicConfigs, validateTopicName } from '@/lib/kafka';
import { readTopicProfileId, topicApiError } from './topic-api';

// @group APIEndpoints > Topics : List topics and actual consumer metadata for the selected profile
export async function GET(request: NextRequest) {
  try {
    const service = await getKafkaService(readTopicProfileId(request));
    await service.connect();
    return NextResponse.json(await service.getTopicsWithConsumerInfo());
  } catch (error) {
    return topicApiError(error, 'Failed to fetch topics. Check the selected Kafka cluster.');
  }
}

// @group APIEndpoints > Topics : Create a topic with validated settings and broker configuration
export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json();
    validateRequestBody(body);
    const { name, partitions = 1, replicationFactor = 1, configs = {}, profileId } = body;
    validateTopicName(name);
    validatePartitionCount(partitions);
    validateSelectedProfileId(profileId);
    validateTopicConfigs(configs);
    if (typeof replicationFactor !== 'number' || !Number.isInteger(replicationFactor) || replicationFactor < 1 || replicationFactor > 32767) {
      throw new KafkaOperationError('Replication factor must be an integer between 1 and 32767', 400);
    }
    const service = await getKafkaService(profileId);
    await service.connect();
    await service.createTopic(name, partitions, replicationFactor, configs);
    return NextResponse.json({ message: 'Topic created successfully' }, { status: 201 });
  } catch (error) {
    return topicApiError(error, 'Failed to create topic. Check the selected Kafka cluster.');
  }
}

// @group APIEndpoints > Topics : Delete a validated topic on the requested profile
export async function DELETE(request: NextRequest) {
  try {
    const name = new URL(request.url).searchParams.get('name');
    validateTopicName(name);
    const service = await getKafkaService(readTopicProfileId(request, true));
    await service.connect();
    await service.deleteTopic(name);
    return NextResponse.json({ message: 'Topic deleted successfully' });
  } catch (error) {
    return topicApiError(error, 'Failed to delete topic. Check the selected Kafka cluster.');
  }
}
