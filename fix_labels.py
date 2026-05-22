
with open('app/dashboard/vehicles/page.js', 'r', encoding='utf-8') as f:
    c = f.read()

replacements = [
    ('Note aggiuntive...', 'Additional notes...'),
    ("Salva prima l'agenzia \u2014 poi potrai aggiungere veicoli NCC e ordini di servizio.", 'Save the agency first \u2014 then you can add NCC vehicles and service orders.'),
    ('>Data *<', '>Date *<'),
    ('label style={lbl}>Tipo Servizio<', 'label style={lbl}>Service Type<'),
    ('label style={lbl}>Descrizione<', 'label style={lbl}>Description<'),
    ('placeholder="Aeroporto BRI \u2192 Hotel Excelsior..."', 'placeholder="BRI Airport \u2192 Hotel Excelsior..."'),
    ('label style={lbl}>Veicolo NCC (Fleet)<', 'label style={lbl}>NCC Vehicle (Fleet)<'),
    ('>— Nessun veicolo collegato —<', '>— No vehicle linked —<'),
    ('Collega a un veicolo NCC gi\u00e0 in flotta (opzionale)', 'Link to an NCC vehicle already in fleet (optional)'),
    ('Driver / Mezzo<', 'Driver / Vehicle<'),
    ("label style={{ ...lbl, color: '#0369a1' }}>Nome Driver<", "label style={{ ...lbl, color: '#0369a1' }}>Driver Name<"),
    ("label style={{ ...lbl, color: '#0369a1' }}>Telefono Driver<", "label style={{ ...lbl, color: '#0369a1' }}>Driver Phone<"),
    ("label style={{ ...lbl, color: '#0369a1' }}>Tipo Mezzo Richiesto<", "label style={{ ...lbl, color: '#0369a1' }}>Vehicle Type Requested<"),
    ("label style={{ ...lbl, color: '#0369a1' }}>Targa Effettiva<", "label style={{ ...lbl, color: '#0369a1' }}>Actual Plate<"),
    ('>\U0001f4cd Chilometri<', '>\U0001f4cd Mileage<'),
    ('label style={lbl}>KM Totali<', 'label style={lbl}>KM Total<'),
    ('>\U0001f4b0 Costi<', '>\U0001f4b0 Costs<'),
    ("label style={{ ...lbl, color: '#a16207' }}>Tipo Tariffa<", "label style={{ ...lbl, color: '#a16207' }}>Rate Type<"),
    ("label style={{ ...lbl, color: '#a16207' }}>Tariffa<", "label style={{ ...lbl, color: '#a16207' }}>Rate<"),
    ("label style={{ ...lbl, color: '#a16207' }}>Valuta<", "label style={{ ...lbl, color: '#a16207' }}>Currency<"),
    ("label style={{ ...lbl, color: '#a16207' }}>Ore Lavorate<", "label style={{ ...lbl, color: '#a16207' }}>Hours Worked<"),
    ("label style={{ ...lbl, color: '#a16207' }}>Importo Netto (override)<", "label style={{ ...lbl, color: '#a16207' }}>Net Amount (override)<"),
    ("label style={{ ...lbl, color: '#a16207' }}>Totale (override)<", "label style={{ ...lbl, color: '#a16207' }}>Total (override)<"),
    ('label style={lbl}>N\u00b0 Fattura<', 'label style={lbl}>Invoice No.<'),
    ('label style={lbl}>Note<', 'label style={lbl}>Notes<'),
    ('>Agenzie: <', '>Agencies: <'),
    ('>Ordini caricati: <', '>Orders loaded: <'),
    ('>Totale spesa: <', '>Total spend: <'),
    ('Nessuna agenzia NCC', 'No NCC agencies yet'),
    ('Clicca + Add Agency per iniziare', 'Click + Add Agency to get started'),
    ('\U0001f690 Veicoli in Flotta', '\U0001f690 Vehicles in Fleet'),
    ('\U0001f4cb Ordini di Servizio', '\U0001f4cb Service Orders'),
    ('Nessun ordine ancora', 'No orders yet'),
    ('{nccVehicles.length} veicoli\n                  ', "{nccVehicles.length} vehicle{nccVehicles.length !== 1 ? 's' : ''}\n                  "),
    ('{agencyOrders.length} ordini\n                    ', "{agencyOrders.length} order{agencyOrders.length !== 1 ? 's' : ''}\n                    "),
    ('Formato: VAN-01, CAR-05 \u2014 usato in Trips e Fleet Monitor', 'Format: VAN-01, CAR-05 \u2014 used in Trips and Fleet Monitor'),
    ('label style={lbl}>Tipo Veicolo<', 'label style={lbl}>Vehicle Type<'),
    ('label style={lbl}>Targa<', 'label style={lbl}>License Plate<'),
    ('label style={lbl}>Capacit\u00e0<', 'label style={lbl}>Capacity<'),
    ("label style={{ ...lbl, color: '#0369a1' }}>Agenzia NCC<", "label style={{ ...lbl, color: '#0369a1' }}>NCC Agency<"),
    ('>\u2014 Seleziona agenzia \u2014<', '>\u2014 Select agency \u2014<'),
    ('\u2139 Nessuna agenzia ancora \u2014 aggiungila prima dal tab NCC', '\u2139 No agencies yet \u2014 add one first from the NCC tab'),
    ("label style={{ ...lbl, color: '#0369a1' }}>Nome Driver NCC<", "label style={{ ...lbl, color: '#0369a1' }}>NCC Driver Name<"),
    ("label style={{ ...lbl, color: '#0369a1' }}>Telefono Driver NCC<", "label style={{ ...lbl, color: '#0369a1' }}>NCC Driver Phone<"),
    ('\U0001f4c5 Disponibilit\u00e0', '\U0001f4c5 Availability'),
    ('label style={lbl}>Dal<', 'label style={lbl}>From<'),
    ('label style={lbl}>Al<', 'label style={lbl}>To<'),
]

changed = 0
for old, new in replacements:
    if old in c:
        c = c.replace(old, new)
        changed += 1
    else:
        print(f'NOT FOUND: {repr(old[:60])}')

with open('app/dashboard/vehicles/page.js', 'w', encoding='utf-8') as f:
    f.write(c)

print(f'Applied {changed}/{len(replacements)} replacements')
