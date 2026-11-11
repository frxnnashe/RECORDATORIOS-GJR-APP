import { betterAuth } from 'better-auth';
import { mongodbAdapter } from '@better-auth/mongo-adapter';
import { Resend } from 'resend';
import { getMongo } from './db';

export function googleEnabled() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function recoveryEnabled() {
  return Boolean(process.env.RESEND_API_KEY && process.env.AUTH_EMAIL_FROM);
}

function makeAuth() {
  const { client, db } = getMongo();
  const baseURL = process.env.BETTER_AUTH_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!baseURL || !secret) throw new Error('Falta configurar el acceso.');
  const useTransactions = process.env.MONGODB_STANDALONE !== 'true';

  return betterAuth({
    appName: 'Reminders GJR',
    baseURL,
    secret,
    database: mongodbAdapter(db, useTransactions ? { client } : { transaction: false }),
    rateLimit: { enabled: true, storage: 'database' },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: recoveryEnabled() ? async ({ user, url }) => {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const result = await resend.emails.send({
          from: process.env.AUTH_EMAIL_FROM!,
          to: user.email,
          subject: 'Restablecé tu contraseña de Reminders GJR',
          text: 'Para elegir una contraseña nueva, abrí este enlace: ' + url,
        });
        if (result.error) throw new Error('Falló el envío del correo de recuperación.');
      } : undefined,
    },
    socialProviders: googleEnabled() ? {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID!,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      },
    } : undefined,
  });
}

let instance: ReturnType<typeof makeAuth> | undefined;
export function auth() {
  return instance ??= makeAuth();
}

