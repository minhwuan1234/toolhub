import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins';
import { APIError } from 'better-auth/api';
import type { Pool } from 'pg';
import { departments } from '../departments';
import { getDatabase } from './database';

export function createAuth(database: Pool, config: { baseURL: string; secret: string; validateSchema?: boolean }) {
  return betterAuth({
    appName: 'Toolhub',
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: [new URL(config.baseURL).origin],
    database,
    plugins: [admin()],
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      requireEmailVerification: false,
    },
    user: {
      modelName: 'users',
      fields: { emailVerified: 'email_verified', createdAt: 'created_at', updatedAt: 'updated_at' },
      additionalFields: {
        department: { type: [...departments], required: true, input: true },
      },
    },
    session: {
      modelName: 'sessions',
      fields: { userId: 'user_id', expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at', ipAddress: 'ip_address', userAgent: 'user_agent' },
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: { enabled: false },
    },
    account: {
      modelName: 'accounts',
      fields: { userId: 'user_id', accountId: 'account_id', providerId: 'provider_id', accessToken: 'access_token', refreshToken: 'refresh_token', idToken: 'id_token', accessTokenExpiresAt: 'access_token_expires_at', refreshTokenExpiresAt: 'refresh_token_expires_at', createdAt: 'created_at', updatedAt: 'updated_at' },
    },
    verification: {
      modelName: 'verification_tokens',
      fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      modelName: 'rate_limits',
      window: 60,
      max: 60,
      customRules: { '/sign-in/email': { window: 60, max: 5 }, '/sign-up/email': { window: 60, max: 3 } },
    },
    advanced: {
      // Railway's public edge supplies this header. Do not expose the app directly.
      ipAddress: { ipAddressHeaders: process.env.RAILWAY_ENVIRONMENT_ID ? ['x-real-ip'] : [] },
      database: { generateId: 'uuid', validateSchema: config.validateSchema ?? true },
      useSecureCookies: new URL(config.baseURL).protocol === 'https:',
    },
    databaseHooks: {
      user: { create: { before: async (user) => {
        if (!departments.includes((user as unknown as {department: typeof departments[number]}).department)) throw new APIError('BAD_REQUEST', { message: 'Select a valid department.' });
        const name = user.name.trim();
        if (!name || name.length > 100) throw new APIError('BAD_REQUEST', { message: 'Enter a name between 1 and 100 characters.' });
        return { data: { ...user, name, email: user.email.trim().toLowerCase() } };
      } } },
    },
  });
}

let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  if (auth) return auth;
  const baseURL = process.env.BETTER_AUTH_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!baseURL || !secret || secret.length < 32) throw new Error('Auth configuration is missing.');
  if (process.env.NODE_ENV === 'production' && new URL(baseURL).protocol !== 'https:') throw new Error('Production auth requires HTTPS.');
  auth = createAuth(getDatabase(), { baseURL, secret });
  return auth;
}
