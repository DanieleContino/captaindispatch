// lib/generateDisplayId.js
// Genera il prossimo display_id sequenziale per crew, vehicles, locations

export async function generateDisplayId(supabase, table, prefix, productionId) {
  const { data } = await supabase
    .from(table)
    .select('display_id')
    .eq('production_id', productionId)
    .like('display_id', `${prefix}%`)
    .order('display_id', { ascending: false })
    .limit(1)

  let maxNum = 0
  if (data && data.length > 0) {
    const n = parseInt(data[0].display_id.replace(new RegExp(`^${prefix}`, 'i'), ''), 10)
    if (!isNaN(n)) maxNum = n
  }

  const padLength = prefix === 'CR' ? 4 : 3
  return `${prefix}${String(maxNum + 1).padStart(padLength, '0')}`
}
