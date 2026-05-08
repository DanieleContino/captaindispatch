import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { decrypt } from '../../../../../lib/crypto.js';

/**
 * POST /api/auth/google/disconnect
 *
 * Disconnects the current user's Google Drive integration:
 *   1. Verifies the user is logged in (Supabase session)
 *   2. Loads the encrypted refresh_token from user_google_tokens
 *   3. Decrypts it and best-effort revokes it on Google's side
 *      (https://oauth2.googleapis.com/revoke)
 *   4. Deletes the row from user_google_tokens (always, even if revoke failed)
 *   5. Returns 200 JSON { ok: true }
 *
 * Note: We use POST (not GET) because this is a state-changing operation
 * and should not be triggerable via simple links/prefetch.
 */

export const dynamic = 'force-dynamic';

export async function POST(request) {
  // 1. Verify Supabase session
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
          // No-op
        },
      },
    }
  );
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return Response.json({ ok: false, error: 'not_logged_in' }, { status: 401 });
  }

  // 2. Build service-role client to access user_google_tokens
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ ok: false, error: 'service_role_missing' }, { status: 500 });
  }
  const adminSupabase = createServiceClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3. Load encrypted refresh_token (might not exist if user already disconnected)
  const { data: tokenRow, error: selectError } = await adminSupabase
    .from('user_google_tokens')
    .select('refresh_token_encrypted')
    .eq('user_id', user.id)
    .maybeSingle();

  if (selectError) {
    console.error('[google/disconnect] select failed:', selectError.message);
    return Response.json({ ok: false, error: 'db_select_failed' }, { status: 500 });
  }

  // 4. Best-effort revoke on Google
  let revokeStatus = 'skipped';
  if (tokenRow?.refresh_token_encrypted) {
    try {
      const refreshToken = decrypt(tokenRow.refresh_token_encrypted);
      const revokeResp = await fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(refreshToken)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }
      );
      revokeStatus = revokeResp.ok ? 'revoked' : `revoke_http_${revokeResp.status}`;
      if (!revokeResp.ok) {
        console.warn('[google/disconnect] revoke non-200:', revokeResp.status);
      }
    } catch (e) {
      console.warn('[google/disconnect] revoke failed (non-fatal):', e?.message || e);
      revokeStatus = 'revoke_threw';
    }
  } else {
    revokeStatus = 'no_token_to_revoke';
  }

  // 5. Delete the local row (always — even if revoke failed)
  const { error: deleteError } = await adminSupabase
    .from('user_google_tokens')
    .delete()
    .eq('user_id', user.id);

  if (deleteError) {
    console.error('[google/disconnect] delete failed:', deleteError.message);
    return Response.json(
      { ok: false, error: 'db_delete_failed', revoke_status: revokeStatus },
      { status: 500 }
    );
  }

  return Response.json({ ok: true, revoke_status: revokeStatus });
}
