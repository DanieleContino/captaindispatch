# TASK: Fix duplicate key error when saving rental vehicle

## Bug
`duplicate key value violates unique constraint "vehicles_pkey"` when editing a rental vehicle (sign code etc.) on a new production.

## Root cause
`vehicles` table has composite PK `(production_id, id)`. The UPDATE queries in `page.js` don't filter by `production_id`, so they match vehicles from other productions too, causing a PK conflict.

## File to edit
`app/dashboard/vehicles/page.js`

## Fix 1 — RentalVehicleSidebar (~line 2056)
Search for:
```js
const r = await supabase.from('vehicles').update(row).eq('id', initial.id)
      err = r.error
    }
    setSaving(false)
    if (err) { setError(err.message); return }
    if (form.driver_crew_id) {
```
Replace the update line with:
```js
const r = await supabase.from('vehicles').update(row).eq('id', initial.id).eq('production_id', productionId)
```

## Fix 2 — VehicleSidebar (~line 159)
Search for:
```js
      const { id, ...upd } = row
      const r = await supabase.from('vehicles').update(upd).eq('id', initial.id); err = r.error
```
Replace with:
```js
      const { id, ...upd } = row
      const r = await supabase.from('vehicles').update(upd).eq('id', initial.id).eq('production_id', PRODUCTION_ID); err = r.error
```

## Fix 3 — ComodatoVehicleSidebar (search in page.js)
Search for any other `.update(row).eq('id', initial.id)` or `.update(row).eq('id', form.id` on the `vehicles` table that lacks `.eq('production_id', ...)` and add the filter.

## Note
`NccVehicleSidebar.js` is already correct — don't touch it.
