'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function PendingPage() {
  const [user, setUser] = useState(null)
  const [isApproved, setIsApproved] = useState(false)
  const router = useRouter()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      // Polling ogni 3 secondi per verificare se l'utente è stato approvato
      const interval = setInterval(async () => {
        try {
          const { data: { user: currentUser } } = await supabase.auth.getUser()
          if (!currentUser) return

          // Importa il service client per controllare user_roles
          const response = await fetch('/api/check-approval', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: currentUser.id }),
          })

          const { isApproved: approved } = await response.json()
          if (approved) {
            setIsApproved(true)
            // Reindirizza a dashboard dopo 1 secondo
            setTimeout(() => router.push('/dashboard'), 1000)
          }
        } catch (err) {
          console.error('Errore durante verifica approvazione:', err)
        }
      }, 3000)

      return () => clearInterval(interval)
    })
  }, [router])

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0f2340 0%, #1e3a5f 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: '16px',
          padding: '48px',
          textAlign: 'center',
          maxWidth: '480px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
      >
        {!isApproved ? (
          <>
            <div
              style={{
                fontSize: '64px',
                marginBottom: '20px',
                animation: 'pulse 2s infinite',
              }}
            >
              ⏳
            </div>

            <h1
              style={{
                fontSize: '24px',
                fontWeight: '900',
                color: '#0f2340',
                margin: '0 0 12px',
                letterSpacing: '-0.5px',
              }}
            >
              Accesso in Attesa
            </h1>

            <p
              style={{
                fontSize: '14px',
                color: '#64748b',
                margin: '0 0 24px',
                lineHeight: '1.6',
              }}
            >
              Ciao <strong>{user?.email}</strong>! 👋
            </p>

            <div
              style={{
                background: '#fff7ed',
                border: '1px solid #fdba74',
                borderLeft: '4px solid #ea580c',
                borderRadius: '10px',
                padding: '16px',
                marginBottom: '24px',
                textAlign: 'left',
              }}
            >
              <p
                style={{
                  margin: '0 0 12px',
                  fontSize: '13px',
                  color: '#92400e',
                  fontWeight: '600',
                }}
              >
                ⚠️ Il tuo accesso è in attesa di approvazione
              </p>
              <p
                style={{
                  margin: '0',
                  fontSize: '12px',
                  color: '#92400e',
                  lineHeight: '1.6',
                }}
              >
                L'amministratore ha ricevuto una notifica della tua richiesta di accesso.
                <br />
                <br />
                Una volta approvato, verrai reindirizzato automaticamente alla dashboard.
              </p>
            </div>

            <div
              style={{
                background: '#f0fdf4',
                border: '1px solid #86efac',
                borderRadius: '10px',
                padding: '12px',
                marginBottom: '24px',
              }}
            >
              <p
                style={{
                  margin: '0',
                  fontSize: '12px',
                  color: '#166534',
                }}
              >
                🔄 Verifico ogni 3 secondi...
              </p>
            </div>

            <button
              onClick={async () => {
                await supabase.auth.signOut()
                router.push('/login')
              }}
              style={{
                width: '100%',
                padding: '12px',
                background: '#e2e8f0',
                color: '#334155',
                border: 'none',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              Torna al Login
            </button>
          </>
        ) : (
          <>
            <div
              style={{
                fontSize: '64px',
                marginBottom: '20px',
              }}
            >
              ✅
            </div>

            <h1
              style={{
                fontSize: '24px',
                fontWeight: '900',
                color: '#16a34a',
                margin: '0 0 12px',
                letterSpacing: '-0.5px',
              }}
            >
              Approvato!
            </h1>

            <p
              style={{
                fontSize: '14px',
                color: '#64748b',
                margin: '0',
              }}
            >
              Reindirizzamento in corso...
            </p>
          </>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
