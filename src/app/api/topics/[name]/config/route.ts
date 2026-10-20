import { NextRequest, NextResponse } from 'next/server';
import { getKafkaService, validateRequestBody, validateTopicConfigs, validateTopicName } from '@/lib/kafka';
import { readTopicProfileId, topicApiError } from '../../topic-api';

// @group APIEndpoints > Configuration : Read actual topic settings from the selected cluster
export async function GET(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    validateTopicName(name);
    const service = await getKafkaService(readTopicProfileId(request));
    await service.connect();
    return NextResponse.json(await service.getTopicConfigs(name));
  } catch (error) {
    return topicApiError(error, 'Failed to read topic configuration. Check the selected Kafka cluster.');
  }
}

// @group APIEndpoints > Configuration : Apply a partial configuration patch preserving other overrides
export async function PUT(request: NextRequest, { params }: { params: Promise<{ name: string }> }) {
  try {
    const { name } = await params;
    validateTopicName(name);
    const body: unknown = await request.json();
    validateRequestBody(body);
    validateTopicConfigs(body.configs);
    const service = await getKafkaService(readTopicProfileId(request, true));
    await service.connect();
    await service.updateTopicConfigs(name, body.configs);
    return NextResponse.json({ success: true });
  } catch (error) {
    return topicApiError(error, 'Failed to update topic configuration. Check the selected Kafka cluster.');
  }
}
