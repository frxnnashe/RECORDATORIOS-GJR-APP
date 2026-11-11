import { createHash, randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import { sendNotification } from 'web-push';
import { z } from 'zod';
import type { Reminder } from '../model';
import { latestOccurrence } from '../reminder-rules';
import { database, type PushDoc, type TaskDoc } from './db';
import { RequestError } from './http';

const pushHost = /^(?:fcm\.googleapis\.com|(?:[a-z0-9-]+\.)*push\.apple\.com|updates\.push\.services\.mozilla\.com|(?:[a-z0-9-]+\.)*notify\.windows\.com)$/i;

function validEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash && pushHost.test(url.hostname);
  } catch {
    return false;
  }
}

const endpointInput = z.string().max(2048).refine(validEndpoint);
const subscriptionInput = z.object({
  endpoint: endpointInput,
  keys: z.object({
    p256dh: z.string().regex(/^[\w-]+$/).refine((key) => Buffer.from(key, 'base64url').length === 65),
    auth: z.string().regex(/^[\w-]+$/).refine((key) => Buffer.from(key, 'base64url').length === 16),
  }),
});

export const pushInput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('enable'), subscription: subscriptionInput }),
  z.object({ type: z.literal('status'), endpoint: endpointInput }),
  z.object({ type: z.literal('disable'), endpoint: endpointInput }),
  z.object({ type: z.literal('test'), endpoint: endpointInput }),
]);

export function vapidPublicKey() {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = process.env;
  return VAPID_PRIVATE_KEY && VAPID_SUBJECT ? VAPID_PUBLIC_KEY ?? '' : '';
}

export function endpointId(endpoint: string) {
  return createHash('sha256').update(endpoint).digest('hex');
}

function sendPush(subscription: PushDoc, payload: { title: string; body: string; url: string; tag: string }, ttl: number) {
  const publicKey = vapidPublicKey();
  if (!publicKey) throw new RequestError('Las notificaciones todavía no están configuradas.', 503);
  return sendNotification(
    { endpoint: subscription.endpoint, keys: subscription.keys },
    JSON.stringify(payload),
    {
      TTL: ttl,
      timeout: 6000,
      vapidDetails: { publicKey, privateKey: process.env.VAPID_PRIVATE_KEY!, subject: process.env.VAPID_SUBJECT! },
    },
  );
}

function gone(error: unknown) {
  if (!error || typeof error !== 'object' || !('statusCode' in error)) return false;
  return error.statusCode === 404 || error.statusCode === 410;
}

export async function changePush(ownerId: string, action: z.infer<typeof pushInput>) {
  const { push } = await database();
  if (action.type === 'enable') {
    if (!vapidPublicKey()) throw new RequestError('Las notificaciones todavía no están configuradas.', 503);
    const { endpoint, keys } = action.subscription;
    await push.updateOne(
      { _id: endpointId(endpoint) },
      { $set: { endpoint, keys, ownerId, updatedAt: new Date() } },
      { upsert: true },
    );
    return;
  }
  const filter = { _id: endpointId(action.endpoint), ownerId };
  if (action.type === 'disable') {
    await push.deleteOne(filter);
    return;
  }
  const subscription = await push.findOne(filter);
  if (action.type === 'status') return { enabled: Boolean(subscription) };
  if (!subscription) throw new RequestError('Activá las notificaciones en este dispositivo.', 404);

  try {
    await sendPush(subscription, {
      title: 'Reminders GJR',
      body: 'Las notificaciones están activadas en este dispositivo.',
      url: '/?view=today',
      tag: 'reminders-test',
    }, 300);
  } catch (error) {
    if (gone(error)) {
      await push.deleteOne({ ...filter, updatedAt: subscription.updatedAt });
      throw new RequestError('La suscripción caducó. Volvé a activar las notificaciones.', 410);
    }
    throw error;
  }
}

const day = 86_400_000;
type Data = Awaited<ReturnType<typeof database>>;

async function deliver(data: Data, task: TaskDoc, reminder: Reminder, occurrence: string, subscription: PushDoc) {
  const now = new Date();
  const tag = reminder.kind === 'recurring' ? reminder.id + ':' + occurrence : reminder.id;
  const id = tag + ':' + subscription._id;
  const leaseId = randomUUID();
  let claim;
  try {
    claim = await data.deliveries.findOneAndUpdate(
      { _id: id, finishedAt: { $exists: false }, leaseUntil: { $lte: now } },
      {
        $set: { leaseId, leaseUntil: new Date(now.getTime() + 30_000) },
        $setOnInsert: { expireAt: new Date(new Date(occurrence).getTime() + 2 * day) },
        $inc: { attempts: 1 },
      },
      { upsert: true, returnDocument: 'after' },
    );
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) return false;
    throw error;
  }
  if (!claim) return false;

  const target = { _id: id, leaseId };
  const [current, active] = await Promise.all([
    data.tasks.findOne({ _id: task._id, ownerId: task.ownerId, status: { $ne: 'done' }, 'reminders.id': reminder.id }),
    data.push.findOne({ _id: subscription._id, ownerId: task.ownerId }),
  ]);
  if (!current || !active) {
    await data.deliveries.updateOne(target, { $set: { finishedAt: new Date() } });
    return false;
  }

  try {
    await sendPush(active, {
      title: 'Reminders GJR',
      body: current.title,
      url: '/?task=' + current._id,
      tag,
    }, 3600);
  } catch (error) {
    if (gone(error)) {
      await data.push.deleteOne({ _id: active._id, ownerId: active.ownerId, updatedAt: active.updatedAt });
      await data.deliveries.updateOne(target, { $set: { finishedAt: new Date() } });
      return false;
    }
    const backoff = Math.min(60, 2 ** Math.min(claim.attempts, 6));
    await data.deliveries.updateOne(target, { $set: { leaseUntil: new Date(Date.now() + backoff * 60_000) } });
    return false;
  }
  await data.deliveries.updateOne(target, { $set: { finishedAt: new Date() } });
  return true;
}

export async function dispatchReminders() {
  if (!vapidPublicKey()) throw new RequestError('Falta la configuración de notificaciones.', 503);
  const data = await database();
  const now = new Date();
  const latest = now.toISOString();
  const earliest = new Date(now.getTime() - day).toISOString();
  const tasks = data.tasks.find({
    status: { $ne: 'done' },
    reminders: {
      $elemMatch: {
        fireAt: { $lte: latest },
        $or: [
          { fireAt: { $gt: earliest } },
          { kind: 'recurring', $or: [{ until: null }, { until: { $gte: new Date(now.getTime() - 2 * day).toISOString().slice(0, 10) } }] },
        ],
      },
    },
  }).batchSize(30);
  const devices = new Map<string, PushDoc[]>();
  let sent = 0;
  for await (const task of tasks) {
    if (Date.now() - now.getTime() > 45_000) break;
    let subscriptions = devices.get(task.ownerId);
    if (!subscriptions) {
      subscriptions = await data.push.find({ ownerId: task.ownerId }).toArray();
      devices.set(task.ownerId, subscriptions);
    }
    if (subscriptions.length === 0) continue;
    for (const reminder of task.reminders) {
      const occurrence = latestOccurrence(reminder, now);
      if (!occurrence) continue;
      const results = await Promise.all(subscriptions.map((item) => deliver(data, task, reminder, occurrence, item)));
      sent += results.filter(Boolean).length;
    }
  }
  return sent;
}

