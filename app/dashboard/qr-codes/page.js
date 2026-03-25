'use client'

/**
 * /dashboard/qr-codes
 *
 * Genera e stampa i QR code per veicoli e crew.
 *
 * Flusso operativo:
 *  1. Admin stampa questa pagina (un QR per veicolo)
 *  2. QR viene incollato sul cruscotto del van / sul badge crew
 *  3. Driver scansiona QR col telefono → /scan?qr=VH:VAN-01
 *  4. Nella pagina scan appare il bottone "📦 Wrap Trip"
 *  5. Driver completa il wizard 4-step e crea i trip di rientro
 *
 * QR URL format:
 *  Veicoli: {baseUrl}/scan?qr=VH:{vehicleId}
 *  Crew:    {baseUrl}/scan?qr=CR:{crewId}
 *
 * QR image: api.qrserver.com (gratuito, no chiave API)
 */

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

const PRODUCTION_ID = process.env.NEXT_PUBLIC_PRODUCTION_ID

function qrImgUrl(data, size = 160) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(data)}&margin=8&format=png`
}

// Determina base URL (localhost in dev, dominio in prod)
function baseUrl() {
  if (typeof window === 'undefined') return ''
  return window.location.origin
}

export default function QrCodesPage() {
  const router  = useRouter()
  const [user,     setUser]     = useState(null)
  const [vehicles, setVehicles] = useState([])
  const [crew,     setCrew]     = useState([])
  const [tab,      setTab]      = useState('vehicles')  // 'vehicles' | 'crew'
  const [loading,  setLoading]  = useState(true)
  const [base,     setBase]     = useState('')

  useEffect(() => {
    setBase(baseUrl())
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      setUser(user)
      if (!PRODUCTION_ID) { setLoading(false); return }
      Promise.all([
        supabase.from('vehicles').select('id,driver_name,sign_code,capacity,vehicle_type,active')
          .eq('production_id', PRODUCTION_ID).order('id'),
        supabase.from('crew').select('id,full_name,department,hotel_id')
          .eq('production_id', PRODUCTION_ID).eq('hotel_status', 'CONFIRMED')
          .order('department').order('full_name'),
      ]).then(([vR, cR]) => {
        setVehicles(vR.data || [])
        setCrew(cR.data || [])
        setLoading(false)
      })
    })
  }, [])

  const NAV = [
    { l: 'Dashboard', p: '/dashboard' }, { l: 'Fleet', p: '/dashboard/fleet' },
    { l: 'Trips', p: '/dashboard/trips' }, { l: 'Lists', p: '/dashboard/lists' },
    { l: 'Crew', p: '/dashboard/crew' }, { l: 'Hub Cov.', p: '/dashboard/hub-coverage' },
    { l: 'Pax Cov.', p: '/dashboard/pax-coverage' },
    { l: 'Reports', p: '/dashboard/reports' }, { l: 'QR', p: '/dashboard/qr-codes' },
    { l: 'Locations', p: '/dashboard/locations' }, { l: 'Vehicles', p: '/dashboard/vehicles' },
    { l: '🎬 Prods', p: '/dashboard/productions' },
  ]

  if (!user) return <div style={{ minHeight:'100vh', background:'#0f2340', display:'flex', alignItems:'center', justifyContent:'center', color:'white' }}>Loading…</div>

  return (
    <div style={{ minHeight:'100vh', background:'#f1f5f9' }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .qr-grid { grid-template-columns: repeat(3, 1fr) !important; gap: 12px !important; padding: 0 !important; }
          .qr-card { break-inside: avoid; border: 1px solid #e2e8f0 !important; box-shadow: none !important; }
        }
        @page { margin: 10mm; }
      `}</style>

      {/* Header */}
      <div className="no-print" style={{ background:'#0f2340', padding:'0 24px', height:'52px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:30 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'20px' }}>
          <div style={{ fontSize:'20px', fontWeight:'900', color:'white', letterSpacing:'-1px', cursor:'pointer' }} onClick={() => router.push('/dashboard')}>
            CAPTAIN <span style={{ color:'#2563eb' }}>Dispatch</span>
          </div>
          <nav style={{ display:'flex', gap:'2px' }}>
            {NAV.map(({ l, p }) => (
              <a key={p} href={p} style={{ padding:'5px 12px', borderRadius:'7px', fontSize:'13px', fontWeight:'600', color:'#94a3b8', background:'transparent', textDecoration:'none', whiteSpace:'nowrap' }}>{l}</a>
            ))}
          </nav>
        </div>
        <button onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
          style={{ background:'transparent', border:'1px solid #334155', color:'#94a3b8', padding:'5px 12px', borderRadius:'7px', cursor:'pointer', fontSize:'12px' }}>
          Sign out
        </button>
      </div>

      {/* Toolbar */}
      <div className="no-print" style={{ background:'white', borderBottom:'1px solid #e2e8f0', padding:'0 24px', height:'52px', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:'52px', zIndex:20 }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <span style={{ fontWeight:'800', fontSize:'16px', color:'#0f172a' }}>📱 QR Codes</span>
          <span style={{ color:'#cbd5e1' }}>·</span>
          {['vehicles', 'crew'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ padding:'4px 12px', borderRadius:'999px', fontSize:'12px', fontWeight:'700', cursor:'pointer', border:'1px solid', ...(tab === t ? { background:'#0f2340', color:'white', borderColor:'#0f2340' } : { background:'white', color:'#64748b', borderColor:'#e2e8f0' }) }}>
              {t === 'vehicles' ? `🚐 Veicoli (${vehicles.filter(v => v.active !== false).length})` : `🎬 Crew (${crew.length})`}
            </button>
          ))}
        </div>
        <button onClick={() => window.print()}
          style={{ background:'#0f2340', color:'white', border:'none', borderRadius:'8px', padding:'7px 18px', fontSize:'13px', fontWeight:'800', cursor:'pointer' }}>
          🖨 Stampa / PDF
        </button>
      </div>

      {/* Content */}
      <div style={{ maxWidth:'1000px', margin:'0 auto', padding:'24px' }}>

        {/* ── How-to banner ── */}
        <div className="no-print" style={{ background:'white', border:'1px solid #e2e8f0', borderLeft:'4px solid #2563eb', borderRadius:'10px', padding:'14px 18px', marginBottom:'20px', fontSize:'12px', color:'#374151', lineHeight:1.7 }}>
          <div style={{ fontWeight:'800', fontSize:'13px', color:'#0f172a', marginBottom:'6px' }}>📱 Come usare Wrap Trip sul mobile</div>
          <ol style={{ margin:0, paddingLeft:'18px', display:'flex', flexDirection:'column', gap:'3px' }}>
            <li><strong>Stampa</strong> questa pagina e ritaglia/incolla i QR code sui cruscotti dei veicoli (o sui badge crew)</li>
            <li>Il <strong>driver scansiona</strong> il QR col telefono (fotocamera o QR scanner)</li>
            <li>Apre automaticamente la scheda veicolo → clicca <strong>"📦 Wrap Trip"</strong></li>
            <li>Seleziona data / call time / pickup location (dove si trova adesso)</li>
            <li>Seleziona i <strong>passeggeri</strong> che sono in macchina</li>
            <li>Conferma → il sistema crea automaticamente <strong>un trip per ogni hotel</strong> di destinazione</li>
          </ol>
          <div style={{ marginTop:'8px', fontSize:'11px', color:'#94a3b8' }}>
            URL diretto: <a href="/wrap-trip" style={{ color:'#2563eb', fontFamily:'monospace' }}>{base}/wrap-trip</a>
            {' '}· oppure diretto su veicolo: <span style={{ fontFamily:'monospace', color:'#64748b' }}>{base}/wrap-trip?vehicle=VAN-01</span>
          </div>
        </div>

        {!PRODUCTION_ID && (
          <div style={{ padding:'10px 14px', background:'#fef2f2', border:'1px solid #fecaca', borderRadius:'8px', color:'#dc2626', fontSize:'12px', marginBottom:'16px' }}>
            ⚠ <strong>NEXT_PUBLIC_PRODUCTION_ID</strong> non impostato in .env.local
          </div>
        )}

        {loading ? (
          <div style={{ textAlign:'center', padding:'60px', color:'#94a3b8' }}>Caricamento…</div>
        ) : (
          <>
            {/* ── Print header (visibile solo in stampa) ── */}
            <div style={{ background:'white', borderRadius:'10px', padding:'12px 18px', marginBottom:'16px', border:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:'16px', fontWeight:'900', color:'#0f2340' }}>
                CAPTAIN <span style={{ color:'#2563eb' }}>Dispatch</span>
                <span style={{ fontSize:'12px', color:'#64748b', fontWeight:'500', marginLeft:'10px' }}>
                  QR Codes — {tab === 'vehicles' ? 'Veicoli' : 'Crew'}
                </span>
              </div>
              <div style={{ fontSize:'11px', color:'#94a3b8' }}>Scan → {base}/scan</div>
            </div>

            {/* ── Vehicle QR grid ── */}
            {tab === 'vehicles' && (
              <div className="qr-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:'14px' }}>
                {vehicles.filter(v => v.active !== false).map(v => {
                  const scanUrl = `${base}/scan?qr=VH:${v.id}`
                  const wrapUrl = `${base}/wrap-trip?vehicle=${v.id}`
                  return (
                    <div key={v.id} className="qr-card" style={{ background:'white', borderRadius:'12px', padding:'20px', border:'1px solid #e2e8f0', display:'flex', gap:'16px', alignItems:'flex-start', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
                      {/* QR Image */}
                      <div style={{ flexShrink:0 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={qrImgUrl(scanUrl)} alt={`QR ${v.id}`}
                          width={80} height={80}
                          style={{ display:'block', borderRadius:'6px', border:'1px solid #f1f5f9' }} />
                      </div>
                      {/* Info */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'17px', fontWeight:'900', color:'#0f172a', fontFamily:'monospace', marginBottom:'3px' }}>{v.id}</div>
                        {v.sign_code && <div style={{ fontSize:'12px', fontWeight:'700', color:'#2563eb', marginBottom:'2px' }}>{v.sign_code}</div>}
                        {v.driver_name && <div style={{ fontSize:'11px', color:'#64748b', marginBottom:'2px' }}>👤 {v.driver_name}</div>}
                        <div style={{ fontSize:'10px', color:'#94a3b8', marginBottom:'8px' }}>
                          {[v.vehicle_type, v.capacity ? `×${v.capacity} pax` : null].filter(Boolean).join(' · ')}
                        </div>
                        {/* Test links (no-print) */}
                        <div className="no-print" style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
                          <a href={scanUrl} target="_blank" style={{ fontSize:'9px', fontWeight:'700', color:'#1d4ed8', background:'#eff6ff', padding:'2px 6px', borderRadius:'4px', textDecoration:'none' }}>
                            🔗 Scan
                          </a>
                          <a href={wrapUrl} target="_blank" style={{ fontSize:'9px', fontWeight:'700', color:'#15803d', background:'#f0fdf4', padding:'2px 6px', borderRadius:'4px', textDecoration:'none' }}>
                            📦 Wrap Trip
                          </a>
                        </div>
                        {/* URL (print) */}
                        <div style={{ fontSize:'8px', color:'#94a3b8', fontFamily:'monospace', marginTop:'4px', wordBreak:'break-all', lineHeight:1.3 }}>
                          {scanUrl}
                        </div>
                      </div>
                    </div>
                  )
                })}
                {vehicles.filter(v => v.active !== false).length === 0 && (
                  <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'40px', color:'#94a3b8' }}>
                    Nessun veicolo trovato. Aggiungili in <a href="/dashboard/vehicles" style={{ color:'#2563eb' }}>Vehicles</a>.
                  </div>
                )}
              </div>
            )}

            {/* ── Crew QR grid ── */}
            {tab === 'crew' && (
              <div className="qr-grid" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(240px, 1fr))', gap:'12px' }}>
                {crew.map(c => {
                  const scanUrl = `${base}/scan?qr=CR:${c.id}`
                  return (
                    <div key={c.id} className="qr-card" style={{ background:'white', borderRadius:'10px', padding:'14px 16px', border:'1px solid #e2e8f0', display:'flex', gap:'12px', alignItems:'flex-start', boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrImgUrl(scanUrl, 70)} alt={`QR ${c.id}`}
                        width={56} height={56}
                        style={{ display:'block', borderRadius:'5px', flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'13px', fontWeight:'800', color:'#0f172a', marginBottom:'2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.full_name}</div>
                        <div style={{ fontSize:'10px', color:'#64748b', marginBottom:'2px' }}>{c.department}</div>
                        <div className="no-print">
                          <a href={scanUrl} target="_blank" style={{ fontSize:'9px', fontWeight:'700', color:'#1d4ed8', background:'#eff6ff', padding:'2px 6px', borderRadius:'4px', textDecoration:'none' }}>
                            🔗 Scan
                          </a>
                        </div>
                        <div style={{ fontSize:'7px', color:'#cbd5e1', fontFamily:'monospace', marginTop:'3px', wordBreak:'break-all' }}>{scanUrl}</div>
                      </div>
                    </div>
                  )
                })}
                {crew.length === 0 && (
                  <div style={{ gridColumn:'1/-1', textAlign:'center', padding:'40px', color:'#94a3b8' }}>
                    Nessun crew CONFIRMED trovato.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
