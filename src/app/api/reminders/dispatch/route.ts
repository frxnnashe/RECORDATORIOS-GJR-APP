import { timingSafeEqual } from 'node:crypto';
import { Receiver } from '@upstash/qstash';
import { errorResponse, RequestError } from '@/lib/server/http';
import { dispatchReminders } from '@/lib/server/push';

export const maxDuration = 60;

function vercelAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const expected = Buffer.from('Bearer ' + secret);
  const received = Buffer.from(request.headers.get('authorization') ?? '');
  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function qstashAuthorized(request: Request) {
  const { QSTASH_CURRENT_SIGNING_KEY, QSTASH_NEXT_SIGNING_KEY, BETTER_AUTH_URL } = process.env;
  const signature = request.headers.get('upstash-signature');
  if (!QSTASH_CURRENT_SIGNING_KEY || !QSTASH_NEXT_SIGNING_KEY || !BETTER_AUTH_URL || !signature) return false;

  const receiver = new Receiver({
    currentSigningKey: QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: QSTASH_NEXT_SIGNING_KEY,
  });
  return receiver.verify({
    signature,
    body: await request.text(),
    url: new URL('/api/reminders/dispatch', BETTER_AUTH_URL).href,
  }).catch(() => false);
}

export async function POST(request: Request) {
  try {
    if (!vercelAuthorized(request) && !await qstashAuthorized(request)) {
      throw new RequestError('Solicitud sin autorización.', 401);
    }

    return Response.json({ sent: await dispatchReminders() });
  } catch (error) {
    return errorResponse(error);
  }
}

