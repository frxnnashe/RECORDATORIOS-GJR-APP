import { MongoClient, type Db } from 'mongodb';
import type { Project, Task } from '../model';
import type { PushSubscription } from 'web-push';

export type TaskDoc = Omit<Task, 'id' | 'dueAt' | 'createdAt' | 'updatedAt'> & {
  _id: string;
  ownerId: string;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ProjectDoc = Omit<Project, 'id'> & {
  _id: string;
  ownerId: string;
  createdAt: Date;
};

export type PushDoc = PushSubscription & {
  _id: string;
  ownerId: string;
  updatedAt: Date;
};

export type DeliveryDoc = {
  _id: string;
  attempts: number;
  leaseUntil: Date;
  leaseId?: string;
  finishedAt?: Date;
  scheduledAt?: Date;
  acceptedAt?: Date;
  expireAt: Date;
};

type WidgetToken = { _id: string; ownerId: string; createdAt: Date; tokenHash: string };

const globalMongo = globalThis as typeof globalThis & {
  remindersMongo?: MongoClient;
  remindersIndexes?: Promise<void>;
};

export function getMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('Falta configurar MONGODB_URI.');
  const client = globalMongo.remindersMongo ??= new MongoClient(uri, {
    maxPoolSize: 10,
    minPoolSize: 0,
    serverSelectionTimeoutMS: 5000,
  });
  return { client, db: client.db(process.env.MONGODB_DB || 'reminders_gjr') };
}

export function collections(db: Db) {
  return {
    tasks: db.collection<TaskDoc>('tasks'),
    projects: db.collection<ProjectDoc>('projects'),
    push: db.collection<PushDoc>('push_subscriptions'),
    deliveries: db.collection<DeliveryDoc>('push_deliveries'),
    widget: db.collection<WidgetToken>('widget_tokens'),
  };
}

export async function database() {
  const { db } = getMongo();
  const data = collections(db);
  globalMongo.remindersIndexes ??= Promise.all([
    db.collection('user').createIndex({ email: 1 }, { unique: true }),
    db.collection('session').createIndex({ token: 1 }, { unique: true }),
    db.collection('account').createIndex({ accountId: 1, providerId: 1 }, { unique: true }),
    db.collection('verification').createIndex({ identifier: 1 }),
    data.tasks.createIndex({ ownerId: 1, createdAt: -1 }),
    data.tasks.createIndex({ 'reminders.fireAt': 1, status: 1 }),
    data.projects.createIndex({ ownerId: 1, createdAt: 1 }),
    data.push.createIndex({ ownerId: 1 }),
    data.widget.createIndex({ ownerId: 1 }, { unique: true }),
    data.widget.createIndex({ tokenHash: 1 }, { unique: true }),
    data.deliveries.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
  ]).then(() => undefined).catch((error) => {
    globalMongo.remindersIndexes = undefined;
    throw error;
  });

  await globalMongo.remindersIndexes;
  return data;
}

