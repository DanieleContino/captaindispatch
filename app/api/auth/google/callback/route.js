import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { encrypt } from '../../../../../lib/crypto.js';

/**
 * GET /api/auth/google/callback?code=...&state=...
 *
 * Final step of the Google OAuth flow:
 *   1. Verify the state query param matches the g_oauth_state cookie (CSRF)
 *   2. Verify the user is still logged in to CaptainDispatch
 *   3. Exchange the authorization code for tokens (access_token + refresh_token)
 *   4. Fetch the user's Google email (for display in Settings)
 *   5. Encrypt the refresh_token with lib/crypto.js
 *   6. Upsert into user_google_tokens (one row per CaptainDispatch user)
 *   7. Redirect to /dashboard/settings?google=connected
 *
 * If anything fails, redirect to /dashboard/settings?google=error&reason=...
 */

export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'g_oauth_state';
const SETTINGS_PATH = '/dashboard/settings';

function redirectToSettings(request, params) {
  const url = new URL(SETTINGS_PATH, request.url);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  // Build response that ALSO clears the state cookie
  const headers = new Headers();
  headers.set('Location', url.toString());
  headers.append(
    'Set-Cookie',
    `${STATE_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
  return new Response(null, { status: 303, headers });
}

export async function GET(request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const oauthError = url.searchParams.get('error');

  // User cancelled or Google returned an error
  if (oauthError) {
    return redirectToSettings(request, { google: 'error', reason: oauthError });
  }
  if (!code || !state) {
    return redirectToSettings(request, { google: 'error', reason: 'missing_code_or_state' });
  }

  // 1. Verify CSRF state
  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE)?.value;
  if (!stateCookie || stateCookie !== state) {
    return redirectToSettings(request, { google: 'error', reason: 'state_mismatch' });
  }

  // 2. Verify Supabase session
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // No-op
        },
      },
    }
  );
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return redirectToSettings(request, { google: 'error', reason: 'not_logged_in' });
  }

  // 3. Validate env
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return redirectToSettings(request, { google: 'error', reason: 'env_missing' });
  }

  // 4. Exchange code for tokens
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  let tokens;
  try {
    const tokenResp = await oauth2Client.getToken(code);
    tokens = tokenResp.tokens;
  } catch (e) {
    console.error('[google/callback] getToken failed:', e?.message || e);
    return redirectToSettings(request, { google: 'error', reason: 'token_exchange_failed' });
  }

  if (!tokens.refresh_token) {
    // This happens if the user previously authorized this app and Google did NOT
    // re-issue a refresh_token. Mitigation: prompt=consent in /connect forces it.
    // If we still get here, instruct the user to revoke at myaccount.google.com and retry.
    return redirectToSettings(request, { google: 'error', reason: 'no_refresh_token' });
  }

  // 5. Fetch the user's Google email (for display in Settings)
  let googleEmail = null;
  try {
    oauth2Client.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const me = await oauth2.userinfo.get();
    googleEmail = me.data?.email || null;
  } catch (e) {
    console.warn('[google/callback] userinfo fetch failed (non-fatal):', e?.message || e);
  }

  // 6. Encrypt refresh_token
  let refreshTokenEncrypted;
  try {
    refreshTokenEncrypted = encrypt(tokens.refresh_token);
  } catch (e) {
    console.error('[google/callback] encrypt failed:', e?.message || e);
    return redirectToSettings(request, { google: 'error', reason: 'encrypt_failed' });
  }

  // 7. Upsert into user_google_tokens via service-role client (bypass RLS)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return redirectToSettings(request, { google: 'error', reason: 'service_role_missing' });
  }
  const adminSupabase = createServiceClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const scopeStored = Array.isArray(tokens.scope)
    ? tokens.scope.join(' ')
    : (tokens.scope || '');

  const { error: upsertError } = await adminSupabase
    .from('user_google_tokens')
    .upsert(
      {
        user_id: user.id,
        refresh_token_encrypted: refreshTokenEncrypted,
        scope: scopeStored,
        google_email: googleEmail,
        last_refresh_error: null,
        last_refresh_error_at: null,
      },
      { onConflict: 'user_id' }
    );

  if (upsertError) {
    console.error('[google/callback] upsert failed:', upsertError.message);
    return redirectToSettings(request, { google: 'error', reason: 'db_upsert_failed' });
  }

  // 8. Success — redirect to Settings with success flag
  return redirectToSettings(request, { google: 'connected' });
}
