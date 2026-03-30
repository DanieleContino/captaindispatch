/**
 * lib/normalizeDept.js
 * Normalizzazione dipartimento crew — condiviso tra server (parse/route.js) e client (crew/page.js)
 *
 * Canonical values (23):
 * CAMERA, GRIP, ELECTRIC, SOUND, ART, COSTUME, MAKEUP, PRODUCTION, TRANSPORT,
 * HMU, AD, PROPS, SET DEC, ACCOUNTING, PRODUCERS, CATERING, SECURITY, MEDICAL,
 * VFX, DIRECTING, CAST, LOCATIONS, OTHER
 */

/** Mappa TUTTE le forme alternate/plurali/abbreviate → valore canonico uppercase */
export const DEPT_MAP = {

  // ── CAMERA ──────────────────────────────────────────────────
  'CAMERAS':                           'CAMERA',
  'CAMERA DEPARTMENT':                 'CAMERA',
  'CAMERA DEPT':                       'CAMERA',
  'CAMERA DEPT.':                      'CAMERA',
  'CAMERA/VIDEO':                      'CAMERA',
  'VIDEO':                             'CAMERA',
  'DIT':                               'CAMERA',
  'CAMERA UNIT':                       'CAMERA',
  // IT
  'FOTOGRAFIA':                        'CAMERA',
  'MACCHINA':                          'CAMERA',
  'RIPRESE':                           'CAMERA',
  'OPERATORI':                         'CAMERA',

  // ── GRIP ─────────────────────────────────────────────────────
  'GRIPS':                             'GRIP',
  'GRIP DEPARTMENT':                   'GRIP',
  'GRIP DEPT':                         'GRIP',
  'KEY GRIP':                          'GRIP',
  // IT
  'MACCHINISTI':                       'GRIP',

  // ── ELECTRIC ─────────────────────────────────────────────────
  'ELECTRICS':                         'ELECTRIC',
  'ELECTRICAL':                        'ELECTRIC',
  'ELECTRICALS':                       'ELECTRIC',
  'ELECTRIC DEPARTMENT':               'ELECTRIC',
  'ELECTRIC DEPT':                     'ELECTRIC',
  'LIGHTING':                          'ELECTRIC',
  'LIGHTS':                            'ELECTRIC',
  'GAFFERS':                           'ELECTRIC',
  'GAFFER':                            'ELECTRIC',
  // IT
  'ELETTRICISTI':                      'ELECTRIC',
  'LUCI':                              'ELECTRIC',
  'ILLUMINAZIONE':                     'ELECTRIC',

  // ── SOUND ────────────────────────────────────────────────────
  'AUDIO':                             'SOUND',
  'SOUND DEPARTMENT':                  'SOUND',
  'SOUND DEPT':                        'SOUND',
  'SOUNDS':                            'SOUND',
  // IT
  'SUONO':                             'SOUND',
  'FONICO':                            'SOUND',

  // ── ART ──────────────────────────────────────────────────────
  'ART DEPARTMENT':                    'ART',
  'ART DEPT':                          'ART',
  'ART DEPT.':                         'ART',
  'PRODUCTION DESIGN':                 'ART',
  'PRODUCTION DESIGNER':               'ART',
  'CONSTRUCTION':                      'ART',
  // IT
  'SCENOGRAFIA':                       'ART',
  'REPARTO ARTE':                      'ART',

  // ── COSTUME ──────────────────────────────────────────────────
  'COSTUMES':                          'COSTUME',
  'COSTUME DEPARTMENT':                'COSTUME',
  'COSTUME DEPT':                      'COSTUME',
  'WARDROBE':                          'COSTUME',
  'WARDROBE DEPARTMENT':               'COSTUME',
  'WARDROBE DEPT':                     'COSTUME',
  // IT
  'COSTUMI':                           'COSTUME',
  'SARTORIA':                          'COSTUME',

  // ── MAKEUP ───────────────────────────────────────────────────
  'MAKE UP':                           'MAKEUP',
  'MAKE-UP':                           'MAKEUP',
  'MAKEUP DEPARTMENT':                 'MAKEUP',
  'MAKEUP DEPT':                       'MAKEUP',
  'MAKE UP DEPARTMENT':                'MAKEUP',
  'MAKE UP DEPT':                      'MAKEUP',
  // IT
  'TRUCCO':                            'MAKEUP',

  // ── HMU (Hair & Make Up — combined) ──────────────────────────
  'HAIR & MAKE UP':                    'HMU',
  'HAIR AND MAKE UP':                  'HMU',
  'HAIR AND MAKEUP':                   'HMU',
  'HAIR & MAKEUP':                     'HMU',
  'HAIR & MAKE-UP':                    'HMU',
  'HAIR AND MAKE-UP':                  'HMU',
  'H&MU':                              'HMU',
  'HAIR/MAKEUP':                       'HMU',
  'HAIR/MAKE UP':                      'HMU',
  'HAIR & MU':                         'HMU',
  'HAIR':                              'HMU',
  'PARRUCCHIERI':                      'HMU',
  // IT
  'TRUCCO E PARRUCCHIERI':             'HMU',
  'TRUCCO & PARRUCCHIERI':             'HMU',
  'TRUCCO/PARRUCCHIERI':               'HMU',
  'ACCONCIATURE':                      'HMU',

  // ── PRODUCTION ───────────────────────────────────────────────
  'PRODUCTION DEPARTMENT':             'PRODUCTION',
  'PRODUCTION DEPT':                   'PRODUCTION',
  'PROD':                              'PRODUCTION',
  'PRODUCTION OFFICE':                 'PRODUCTION',
  'LINE PRODUCTION':                   'PRODUCTION',
  // IT
  'PRODUZIONE':                        'PRODUCTION',
  'SEGRETERIA DI PRODUZIONE':          'PRODUCTION',
  'SEGRETERIA DI EDIZIONE':            'PRODUCTION',

  // ── TRANSPORT ────────────────────────────────────────────────
  'TRANSPORTATION':                    'TRANSPORT',
  'TRANSPORTS':                        'TRANSPORT',
  'TRANSPORT DEPARTMENT':              'TRANSPORT',
  'TRANSPORT DEPT':                    'TRANSPORT',
  'DRIVERS':                           'TRANSPORT',
  'DRIVING':                           'TRANSPORT',
  'DRIVER':                            'TRANSPORT',
  // IT
  'TRASPORTI':                         'TRANSPORT',
  'AUTISTI':                           'TRANSPORT',
  'TRASPORTATORI':                     'TRANSPORT',

  // ── AD (Assistant Directors) ──────────────────────────────────
  'ASSISTANT DIRECTORS':               'AD',
  'ASSISTANT DIRECTOR':                'AD',
  'ADS':                               'AD',
  '1ST AD':                            'AD',
  '2ND AD':                            'AD',
  '3RD AD':                            'AD',
  'FLOOR':                             'AD',
  // IT
  'AIUTO REGIA':                       'AD',
  'AIUTO REGISTA':                     'AD',
  'ASSISTENTI ALLA REGIA':             'AD',

  // ── PROPS ────────────────────────────────────────────────────
  'PROPERTY':                          'PROPS',
  'PROPERTIES':                        'PROPS',
  'PROP':                              'PROPS',
  'PROPS DEPARTMENT':                  'PROPS',
  'PROPS DEPT':                        'PROPS',
  'PROP DEPT':                         'PROPS',
  // IT
  'OGGETTI DI SCENA':                  'PROPS',
  'ACCESSORISTICA':                    'PROPS',
  'ATTREZZERIA':                       'PROPS',

  // ── SET DEC ───────────────────────────────────────────────────
  'SET DEC & SET DRESSING':            'SET DEC',
  'SET DEC AND SET DRESSING':          'SET DEC',
  'SET DECORATION':                    'SET DEC',
  'SET DRESSING':                      'SET DEC',
  'SET DECOR':                         'SET DEC',
  'SET DÉCOR':                         'SET DEC',
  'SET DECORATION DEPARTMENT':         'SET DEC',
  // IT
  'ARREDAMENTO':                       'SET DEC',
  'ARREDAMENTO DI SCENA':              'SET DEC',
  'DECORAZIONE SET':                   'SET DEC',

  // ── ACCOUNTING ────────────────────────────────────────────────
  'ACCOUNTS':                          'ACCOUNTING',
  'FINANCE':                           'ACCOUNTING',
  'PAYROLL':                           'ACCOUNTING',
  'ACCOUNTING DEPARTMENT':             'ACCOUNTING',
  'ACCOUNTANTS':                       'ACCOUNTING',
  'ACCOUNTS DEPARTMENT':               'ACCOUNTING',
  'FINANCE DEPARTMENT':                'ACCOUNTING',
  // IT
  'AMMINISTRAZIONE':                   'ACCOUNTING',
  'CONTABILITÀ':                       'ACCOUNTING',
  'CONTABILITA':                       'ACCOUNTING',

  // ── PRODUCERS ────────────────────────────────────────────────
  'WRITER':                            'PRODUCERS',
  'WRITERS':                           'PRODUCERS',
  'WRITING':                           'PRODUCERS',
  'WRITERS / DIRECTORS':               'PRODUCERS',
  'PRODUCERS / WRITERS / DIRECTORS':   'PRODUCERS',
  'PRODUCERS/WRITERS/DIRECTORS':       'PRODUCERS',
  'EXECUTIVE PRODUCERS':               'PRODUCERS',
  'DEVELOPMENT':                       'PRODUCERS',
  'STORY':                             'PRODUCERS',
  // IT
  'PRODUTTORI':                        'PRODUCERS',
  'SVILUPPO':                          'PRODUCERS',

  // ── CATERING ─────────────────────────────────────────────────
  'CRAFT SERVICE':                     'CATERING',
  'CRAFT SERVICES':                    'CATERING',
  'CRAFTY':                            'CATERING',
  'CATERING DEPARTMENT':               'CATERING',
  'CATERING SERVICE':                  'CATERING',
  'KITCHEN':                           'CATERING',
  // IT
  'CATERING IT':                       'CATERING',
  'MENSA':                             'CATERING',
  'VETTOVAGLIAMENTO':                  'CATERING',

  // ── SECURITY ─────────────────────────────────────────────────
  'SECURITY DEPARTMENT':               'SECURITY',
  'GUARDS':                            'SECURITY',
  'SECURITY PERSONNEL':                'SECURITY',
  'SECURITY GUARD':                    'SECURITY',
  // IT
  'SICUREZZA':                         'SECURITY',
  'VIGILANZA':                         'SECURITY',

  // ── MEDICAL ──────────────────────────────────────────────────
  'MEDIC':                             'MEDICAL',
  'SET MEDIC':                         'MEDICAL',
  'HEALTH AND SAFETY':                 'MEDICAL',
  'HEALTH & SAFETY':                   'MEDICAL',
  'H&S':                               'MEDICAL',
  'FIRST AID':                         'MEDICAL',
  'NURSE':                             'MEDICAL',
  'PARAMEDIC':                         'MEDICAL',
  // IT
  'MEDICI':                            'MEDICAL',
  'ASSISTENZA MEDICA':                 'MEDICAL',
  'SALUTE E SICUREZZA':                'MEDICAL',

  // ── VFX ──────────────────────────────────────────────────────
  'VISUAL EFFECTS':                    'VFX',
  'VISUAL EFFECTS DEPARTMENT':         'VFX',
  'VFX DEPARTMENT':                    'VFX',
  'SPECIAL EFFECTS':                   'VFX',
  'SFX':                               'VFX',
  'POST PRODUCTION':                   'VFX',
  'POST-PRODUCTION':                   'VFX',
  // IT
  'EFFETTI SPECIALI':                  'VFX',
  'EFFETTI VISIVI':                    'VFX',
  'POST PRODUZIONE':                   'VFX',

  // ── DIRECTING ────────────────────────────────────────────────
  'DIRECTORS':                         'DIRECTING',
  'DIRECTOR':                          'DIRECTING',
  'DIRECTION':                         'DIRECTING',
  'DIRECTING DEPARTMENT':              'DIRECTING',
  // IT
  'REGIA':                             'DIRECTING',

  // ── CAST ─────────────────────────────────────────────────────
  'ACTORS':                            'CAST',
  'ACTOR':                             'CAST',
  'TALENT':                            'CAST',
  'PRINCIPAL CAST':                    'CAST',
  'BACKGROUND':                        'CAST',
  'EXTRAS':                            'CAST',
  'SUPPORTING ARTISTS':                'CAST',
  'SA':                                'CAST',
  'BACKGROUND ARTISTS':                'CAST',
  // IT
  'ATTORI':                            'CAST',
  'CAST ARTISTICO':                    'CAST',
  'COMPARSE':                          'CAST',

  // ── LOCATIONS ────────────────────────────────────────────────
  'LOCATION':                          'LOCATIONS',
  'LOCATION DEPARTMENT':               'LOCATIONS',
  'LOCATIONS DEPARTMENT':              'LOCATIONS',
  'LOCATIONS DEPT':                    'LOCATIONS',
  'LOCATION DEPT':                     'LOCATIONS',
  'SCOUTS':                            'LOCATIONS',
  'LOCATION MANAGERS':                 'LOCATIONS',
  // IT
  'SOPRALLUOGHI':                      'LOCATIONS',
  'LOCATION IT':                       'LOCATIONS',

  // ── OTHER ─────────────────────────────────────────────────────
  'MISC':                              'OTHER',
  'MISCELLANEOUS':                     'OTHER',
  'GENERAL':                           'OTHER',
  'TBC':                               'OTHER',
  'N/A':                               'OTHER',
  'STUNT':                             'OTHER',
  'STUNTS':                            'OTHER',
  'STUNT DEPARTMENT':                  'OTHER',
  // IT
  'VARI':                              'OTHER',
  'ALTRO':                             'OTHER',
}

/**
 * Normalizza il campo department:
 * 1. trim + toUpperCase
 * 2. Lookup nel DEPT_MAP → valore canonico
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeDept(raw) {
  if (!raw) return null
  const upper = raw.trim().toUpperCase()
  return DEPT_MAP[upper] || upper
}
