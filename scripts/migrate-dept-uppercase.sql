-- S22 follow-up: normalizza tutti i department esistenti in UPPERCASE
-- Eseguire in Supabase SQL Editor
-- Questo allinea i dati storici inseriti prima del fix normalizeDept (S22)

UPDATE crew
SET department = UPPER(TRIM(department))
WHERE department IS NOT NULL
  AND department <> UPPER(TRIM(department));

-- Verifica: quante righe aggiornate
-- (il contatto di Supabase mostrerà "N rows affected")
