import { NextRequest, NextResponse } from 'next/server';
import { getKafkaErrorResponse, validateProfileId, validateSelectedProfileId } from '@/lib/kafka';

// @group APIEndpoints > Topics : Shared profile selection and safe failure responses
export function readTopicProfileId(request: NextRequest, required = false): string | undefined {
  const profileId = new URL(request.url).searchParams.get('profileId') ?? undefined;
  if (required) validateSelectedProfileId(profileId);
  else validateProfileId(profileId);
  return profileId;
}

export function topicApiError(error: unknown, fallback: string): NextResponse {
  const response = getKafkaErrorResponse(error, fallback);
  return NextResponse.json({ error: response.error }, { status: response.status });
}
