import { NextResponse } from 'next/server';

// This endpoint has been removed in favor of WebSocket streaming.
// Keeping a stub to return 410 Gone prevents accidental use and eases rollouts.
export async function POST() {
  return NextResponse.json({ error: 'Endpoint removed. Use WebSocket streaming.' }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({ error: 'Endpoint removed. Use WebSocket streaming.' }, { status: 410 });
}

export const dynamic = 'force-dynamic';
export const runtime = 'edge';
