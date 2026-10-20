import { NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/services/access-control';

// @group Authentication : Protect pages and every API entry point before route execution
export function middleware(request: NextRequest) {
  const decision = authorizeRequest(request);
  const response = decision.allowed ? NextResponse.next() : NextResponse.json(
    { error: decision.message },
    { status: decision.status },
  );
  if (!decision.allowed && decision.status === 401) {
    response.headers.set('WWW-Authenticate', 'Basic realm="EZ Kafka Visualizer", charset="UTF-8"');
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'same-origin');
  return response;
}

// @group Configuration : Node crypto supports constant-time credential comparison
export const config = { matcher: '/:path*', runtime: 'nodejs' };
