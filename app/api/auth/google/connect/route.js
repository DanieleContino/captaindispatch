import { google } from 'googleapis';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import crypto from 'crypto';

/**
 * GET /api/auth/google/connect
 *
 * Starts the Google OAuth flow:
 *   1. Verifies the user is logged in to CaptainDispatch (Supabase session)
 *   2. Generates a CSRF state token and stores it in a short-lived HttpOnly cookie
 *   3. Builds the Google authorization URL with:
 *        - access_type=offline   → required to receive a refresh_token
 *        - prompt=consent        → forces refresh_token even if user already authorized
 *        - scope: drive.readonly + userinfo.email
 *   4. Redirects the browser to Google
 *
 * The callback at /api/auth/google/callback will verify the state cookie
 * and exchange the auth code for tokens.
 */

export const dynamic = 'force-dynamic';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/userinfo.email',
];

const STATE_COOKIE = 'g_oauth_state';
const STATE_COOKIE_MAX_AGE = 600; // 10 minutes

export async function GET(request) {
  // 1. Verify Supabase session (user must be logged in to connect Drive)
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // No-op on this route: we don't refresh the session here.
        },
      },
    }
  );

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return Response.redirect(new URL('/login?reason=connect_drive_requires_login', request.url), 303);
  }

  // 2. Validate Google OAuth env vars
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    return Response.json(
      { error: 'Google OAuth env vars not configured' },
      { status: 500 }
    );
  }

  // 3. Generate CSRF state — random 32 bytes hex
  const state = crypto.randomBytes(32).toString('hex');

  // 4. Build Google authorization URL
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });

  // 5. Set state cookie + redirect to Google
  const response = Response.redirect(authUrl, 303);
  // Note: Response.redirect doesn't allow setting cookies via the constructor.
  // We need to build the response manually:
  const headers = new Headers();
  headers.set('Location', authUrl);
  headers.append(
    'Set-Cookie',
    `${STATE_COOKIE}=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${STATE_COOKIE_MAX_AGE}`
  );
  return new Response(null, { status: 303, headers });
}
