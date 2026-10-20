import { NextRequest, NextResponse } from 'next/server';
import { getKafkaErrorResponse, getKafkaService } from '@/lib/kafka';
import { MessageBrowserError, validateBrowseMessagesRequest } from '@/services/kafka-message-browser';

// @group APIEndpoints : Read a bounded partition snapshot without changing application offsets
export async function POST(request: NextRequest) {
  try {
    const data: unknown = await request.json();
    validateBrowseMessagesRequest(data);
    if (request.signal.aborted) throw new MessageBrowserError('Browse request was cancelled', 499);
    const service = await getKafkaService(data.profileId);
    return NextResponse.json(await service.browseMessages(data, request.signal), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const failure = error instanceof MessageBrowserError
      ? { error: error.message, status: error.status }
      : getKafkaErrorResponse(error, 'Unable to browse messages from the selected partition');
    return NextResponse.json({ error: failure.error }, { status: failure.status, headers: { 'Cache-Control': 'no-store' } });
  }
}
