import { google } from 'googleapis';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from './crypto.js';

/**
 * Returns an authenticated Google OAuth2 client for the given user.
 * The OAuth2 client will automatically refresh the access_token using
 * the stored refresh_token whenever needed.
 *
 * Usage:
 *   const auth = await getGoogleOAuthClient(userId);
 *   const drive = google.drive({ version: 'v3', auth });
 *   const res = await drive.files.list({ ... });
 *
 * Throws:
 *   - Error('NO_GOOGLE_TOKEN') if the user has not connected Google Drive yet
 *   - Error('TOKEN_DECRYPT_FAILED') if the stored token cannot be decrypted
 *   - Error('GOOGLE_OAUTH_ENV_MISSING') if env vars are not configured
 *
 * @param {string} userId - Supabase auth.users.id (UUID)
 * @returns {Promise<import('google-auth-library').OAuth2Client>}
 */
export async function getGoogleOAuthClient(userId) {
  if (!userId || typeof userId !== 'string') {
    throw new Error('getGoogleOAuthClient(): userId must be a non-empty string');
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_OAUTH_ENV_MISSING');
  }

  // Use service-role Supabase client to bypass RLS (server-side only)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL not set');
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Load encrypted refresh_token for this user
  const { data, error } = await supabase
    .from('user_google_tokens')
    .select('refresh_token_encrypted, scope')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase error loading google token: ${error.message}`);
  }
  if (!data || !data.refresh_token_encrypted) {
    throw new Error('NO_GOOGLE_TOKEN');
  }

  // Decrypt
  let refreshToken;
  try {
    refreshToken = decrypt(data.refresh_token_encrypted);
  } catch (e) {
    throw new Error('TOKEN_DECRYPT_FAILED');
  }

  // Build the OAuth2 client. googleapis will auto-refresh access_tokens
  // when they expire, using this refresh_token.
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  console.log(`[googleClient] userId=${userId} refreshToken_length=${refreshToken?.length} refreshToken_prefix=${refreshToken?.slice(0,10)}`)

  // Optional: hook into 'tokens' event to log refresh failures.
  // (Persisting new refresh_tokens is not needed: Google does not rotate them.)
  oauth2Client.on('tokens', (tokens) => {
    if (tokens.refresh_token) {
      // Google rarely re-issues a refresh_token, but if it does we should persist it.
      // For now we only log; persistence will be added if/when we observe rotations.
      console.log(`[googleClient] received new refresh_token for user ${userId}`);
    }
  });

  return oauth2Client;
}

/**
 * Convenience wrapper: returns a Drive v3 client for a given user.
 *
 * @param {string} userId
 * @returns {Promise<import('googleapis').drive_v3.Drive>}
 */
export async function getDriveClient(userId) {
  const auth = await getGoogleOAuthClient(userId);
  return google.drive({ version: 'v3', auth });
}
