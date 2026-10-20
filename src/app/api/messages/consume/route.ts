import { NextRequest, NextResponse } from 'next/server';
import { getKafkaService } from '@/lib/kafka';
import { ConsumerSessionError, validateConsumerPoll, validateConsumerSessionId } from '@/services/kafka-consumer-sessions';

// @group Validation : Every inspection request is scoped to an explicit profile
async function readRequest(request: NextRequest) {
  let data;
  try {
    data = await request.json();
  } catch {
    throw new ConsumerSessionError('Invalid JSON in request body', 400);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.profileId !== 'string' || !data.profileId.trim()) {
    throw new ConsumerSessionError('An explicit profileId is required', 400);
  }
  validateConsumerSessionId(data.sessionId);
  return data;
}

function errorResponse(error: unknown) {
  return NextResponse.json(
    { error: error instanceof ConsumerSessionError ? error.message : 'Kafka inspection request failed' },
    { status: error instanceof ConsumerSessionError ? error.status : 502 },
  );
}

// @group APIEndpoints : Poll an isolated session without committing application offsets
export async function POST(request: NextRequest) {
  try {
    const data = await readRequest(request);
    const pollRequest = {
      sessionId: data.sessionId, topics: data.topics, fromBeginning: data.fromBeginning,
      maxMessages: data.maxMessages, timeoutMs: data.timeoutMs,
    };
    validateConsumerPoll(pollRequest);
    const kafkaService = await getKafkaService(data.profileId);
    return NextResponse.json(await kafkaService.pollConsumerSession(pollRequest));
  } catch (error) {
    return errorResponse(error);
  }
}

// @group APIEndpoints : Explicitly release the server session when the browser stops
export async function DELETE(request: NextRequest) {
  try {
    const data = await readRequest(request);
    const kafkaService = await getKafkaService(data.profileId);
    await kafkaService.stopConsumerSession(data.sessionId);
    return NextResponse.json({ sessionId: data.sessionId, stopped: true });
  } catch (error) {
    return errorResponse(error);
  }
}
