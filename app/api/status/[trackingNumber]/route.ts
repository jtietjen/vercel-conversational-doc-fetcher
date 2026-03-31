import { NextRequest, NextResponse } from 'next/server';
import { getPhoneByTrackingNumber, getConversation } from '@/lib/kv';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ trackingNumber: string }> },
): Promise<NextResponse> {
  const { trackingNumber } = await params;

  if (!trackingNumber) {
    return NextResponse.json(
      { error: 'trackingNumber is required' },
      { status: 400 },
    );
  }

  const phone = await getPhoneByTrackingNumber(trackingNumber);
  if (!phone) {
    return NextResponse.json(
      { error: 'No conversation found for this tracking number' },
      { status: 404 },
    );
  }

  const state = await getConversation(phone);
  if (!state) {
    return NextResponse.json(
      { error: 'Conversation state not found' },
      { status: 404 },
    );
  }

  return NextResponse.json({
    trackingNumber: state.trackingNumber,
    status: state.status,
    orderId: state.orderId,
    attempts: state.attempts,
    triggeredAt: state.triggeredAt,
    lastMessageAt: state.lastMessageAt ?? null,
    blobUrl: state.blobUrl ?? null,
    conversation: state.messages,
  });
}
