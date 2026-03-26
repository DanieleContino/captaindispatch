/**
 * lib/sendLoginNotification.js
 * 
 * Invia notifiche email via Gmail SMTP quando un utente fa login.
 * Usa nodemailer per connettersi a Gmail con App Password.
 */

import nodemailer from 'nodemailer'

/**
 * Crea un transporter Nodemailer per Gmail
 */
function createGmailTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  })
}

/**
 * Invia email di notifica login
 * @param {string} userEmail - Email dell'utente che ha fatto login
 * @param {boolean} isApproved - Se l'utente è già approvato (ha un ruolo)
 */
export async function sendLoginNotification(userEmail, isApproved = false) {
  try {
    const transporter = createGmailTransporter()
    
    const subject = isApproved 
      ? '✅ Login — CaptainDispatch'
      : '⚠️ Nuovo accesso — CaptainDispatch'
    
    const htmlContent = isApproved
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #16a34a;">✅ Login Confermato</h2>
          <p><strong>${userEmail}</strong> si è connesso a <strong>CaptainDispatch</strong></p>
          <p style="color: #64748b; font-size: 12px;">
            Orario: ${new Date().toLocaleString('it-IT')}
          </p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #ea580c;">⚠️ Nuovo Accesso in Attesa</h2>
          <p><strong>${userEmail}</strong> vuole accedere a <strong>CaptainDispatch</strong></p>
          <p style="color: #64748b; margin: 20px 0;">
            Questo utente non ha ancora un ruolo assegnato.
          </p>
          <div style="background: #fff7ed; border-left: 4px solid #ea580c; padding: 12px; margin: 20px 0;">
            <p style="margin: 0; color: #92400e; font-size: 13px;">
              <strong>Per approvare:</strong><br/>
              1. Vai su Supabase Dashboard<br/>
              2. Apri la tabella <code>user_roles</code><br/>
              3. Aggiungi una riga con:<br/>
              &nbsp;&nbsp;• <code>user_id</code>: ID dell'utente<br/>
              &nbsp;&nbsp;• <code>production_id</code>: ID della produzione<br/>
              &nbsp;&nbsp;• <code>role</code>: CAPTAIN, MANAGER, PRODUCTION, o ADMIN
            </p>
          </div>
          <p style="color: #64748b; font-size: 12px;">
            Orario richiesta: ${new Date().toLocaleString('it-IT')}
          </p>
        </div>
      `
    
    const mailOptions = {
      from: process.env.GMAIL_USER,
      to: process.env.ADMIN_EMAIL,
      subject,
      html: htmlContent,
    }
    
    const info = await transporter.sendMail(mailOptions)
    console.log('✅ Email inviata:', info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error) {
    console.error('❌ Errore invio email:', error.message)
    return { success: false, error: error.message }
  }
}
