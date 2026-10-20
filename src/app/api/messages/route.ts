import { NextRequest, NextResponse } from 'next/server';
import { getKafkaErrorResponse, getKafkaService, KafkaOperationError, validateProfileId, validateTopicName } from '@/lib/kafka';

// @group APIEndpoints > Messages : Validate producer requests and select an explicit cluster
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new KafkaOperationError('Request must be an object.', 400);
    const { topic, key, value, headers, profileId } = body;
    if (typeof profileId !== 'string' || !profileId) throw new KafkaOperationError('Profile ID is required.', 400);
    validateProfileId(profileId);
    validateTopicName(topic);
    if (typeof value !== 'string' || (key !== undefined && typeof key !== 'string')) throw new KafkaOperationError('Message value and optional key must be strings.', 400);
    if (headers !== undefined && (!headers || typeof headers !== 'object' || Array.isArray(headers) || Object.entries(headers).some(([name, header]) => !name || typeof header !== 'string'))) {
      throw new KafkaOperationError('Headers must be an object containing string values.', 400);
    }
    const kafkaService = await getKafkaService(profileId);
    await kafkaService.sendMessage(topic, { key, value, headers });
    return NextResponse.json({ message: 'Message sent successfully' });
  } catch (error) {
    const failure = getKafkaErrorResponse(error, 'Unable to send the message. Check the selected cluster and topic.');
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
