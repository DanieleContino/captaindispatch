'use client'

import { supabase } from '../../lib/supabase'

export default function LoginPage() {

  async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/auth/callback`,
      scopes: 'https://www.googleapis.com/auth/drive.readonly',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent'
      }
    }
  })
  console.log('signin data:', data, 'error:', error)
}

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0f2340',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px',
        padding: '48px',
        textAlign: 'center',
        width: '360px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
      }}>
        <div style={{
          fontSize: '48px',
          fontWeight: '900',
          color: '#0f2340',
          marginBottom: '8px',
          letterSpacing: '-2px'
        }}>
          CAPTAIN
        </div>
        <div style={{
          fontSize: '13px',
          color: '#64748b',
          marginBottom: '40px'
        }}>
          Dispatch
        </div>

        <button
          onClick={signInWithGoogle}
          style={{
            width: '100%',
            padding: '14px',
            background: '#2563eb',
            color: 'white',
            border: 'none',
            borderRadius: '10px',
            fontSize: '16px',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px'
          }}
        >
          Sign in with Google
        </button>

        <p style={{
          marginTop: '24px',
          fontSize: '12px',
          color: '#94a3b8'
        }}>
          Film · TV · Touring Production
        </p>
      </div>
    </div>
  )
}