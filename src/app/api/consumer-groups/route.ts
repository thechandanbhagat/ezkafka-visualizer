import { NextRequest, NextResponse } from 'next/server';
import { getKafkaErrorResponse, getKafkaService, validateProfileId } from '@/lib/kafka';

// @group APIEndpoints > ConsumerGroups : Broker-backed group state with visible, safe errors
export async function GET(request: NextRequest) {
  try {
    const profileId = new URL(request.url).searchParams.get('profileId') ?? undefined;
    validateProfileId(profileId);
    return NextResponse.json(await (await getKafkaService(profileId)).getConsumerGroups());
  } catch (error) {
    const failure = getKafkaErrorResponse(error, 'Unable to load consumer groups from the selected cluster.');
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}
