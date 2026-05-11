'use client'

import { supabase } from './supabase'
import { CAPTAIN_TEMPLATE_PRESET, BLOCKS_CATALOG } from './tlBlocksCatalog'

// ─── Internal helpers ────────────────────────────────────────

async function getCurrentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Not authenticated')
  return user.id
}

function nextOrderInZone(blocks, zone) {
  const inZone = (blocks || []).filter(b => b.zone === zone)
  if (inZone.length === 0) return 10
  return Math.max(...inZone.map(b => b.display_order || 0)) + 10
}

// ─── TEMPLATES — Library CRUD ────────────────────────────────

/**
 * List all templates owned by the current user.
 * Returns: [{ id, name, description, is_default, created_at, updated_at }]
 */
export async function listUserTemplates() {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('tl_templates')
    .select('id, name, description, is_default, created_at, updated_at')
    .eq('owner_user_id', userId)
    .order('updated_at', { ascending: false })
  if (error) throw error
  return data || []
}

/**
 * Load a single template with all its blocks.
 * Returns: { ...template, blocks: [...] }
 */
export async function loadTemplate(templateId) {
  const { data: tpl, error: tplErr } = await supabase
    .from('tl_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  if (tplErr) throw tplErr

  const { data: blocks, error: blocksErr } = await supabase
    .from('tl_template_blocks')
    .select('*')
    .eq('template_id', templateId)
    .order('display_order', { ascending: true })
  if (blocksErr) throw blocksErr

  return { ...tpl, blocks: blocks || [] }
}

/**
 * Create a blank template (no blocks).
 */
export async function createBlankTemplate(name, description = null) {
  const userId = await getCurrentUserId()
  const { data, error } = await supabase
    .from('tl_templates')
    .insert({ owner_user_id: userId, name, description })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Create a template from the hardcoded Captain Template preset.
 * Inserts the template row and all its blocks atomically.
 */
export async function createTemplateFromPreset(customName = null) {
  const userId = await getCurrentUserId()
  const preset = CAPTAIN_TEMPLATE_PRESET

  // 1) Create template row
  const { data: tpl, error: tplErr } = await supabase
    .from('tl_templates')
    .insert({
      owner_user_id: userId,
      name: customName || preset.name,
      description: preset.description,
    })
    .select()
    .single()
  if (tplErr) throw tplErr

  // 2) Insert blocks
  const blocksToInsert = preset.blocks.map(b => ({
    template_id: tpl.id,
    zone: b.zone,
    display_order: b.display_order,
    block_type: b.block_type,
    config: b.config,
    width: b.width,
  }))
  const { data: blocks, error: blocksErr } = await supabase
    .from('tl_template_blocks')
    .insert(blocksToInsert)
    .select()
  if (blocksErr) {
    // Best-effort rollback: delete the template row
    await supabase.from('tl_templates').delete().eq('id', tpl.id)
    throw blocksErr
  }

  return { ...tpl, blocks: blocks || [] }
}

/**
 * Duplicate an existing template (deep copy: template + blocks).
 */
export async function duplicateTemplate(sourceTemplateId, newName = null) {
  const userId = await getCurrentUserId()
  const source = await loadTemplate(sourceTemplateId)

  const { data: tpl, error: tplErr } = await supabase
    .from('tl_templates')
    .insert({
      owner_user_id: userId,
      name: newName || `${source.name} (copy)`,
      description: source.description,
    })
    .select()
    .single()
  if (tplErr) throw tplErr

  if (source.blocks.length > 0) {
    const blocksToInsert = source.blocks.map(b => ({
      template_id: tpl.id,
      zone: b.zone,
      display_order: b.display_order,
      block_type: b.block_type,
      config: b.config,
      width: b.width,
    }))
    const { error: blocksErr } = await supabase
      .from('tl_template_blocks')
      .insert(blocksToInsert)
    if (blocksErr) {
      await supabase.from('tl_templates').delete().eq('id', tpl.id)
      throw blocksErr
    }
  }

  return await loadTemplate(tpl.id)
}

/**
 * Rename a template.
 */
export async function renameTemplate(templateId, newName) {
  const { data, error } = await supabase
    .from('tl_templates')
    .update({ name: newName })
    .eq('id', templateId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Delete a template (cascades to blocks).
 * If any production has this template_id, the production_template.template_id
 * becomes NULL (ON DELETE SET NULL).
 */
export async function deleteTemplate(templateId) {
  const { error } = await supabase
    .from('tl_templates')
    .delete()
    .eq('id', templateId)
  if (error) throw error
  return { ok: true }
}

// ─── BLOCKS — CRUD inside a template ─────────────────────────

/**
 * Add a new block to a template.
 * Pulls defaultConfig from BLOCKS_CATALOG if not provided.
 */
export async function addBlock(templateId, zone, blockType, opts = {}) {
  const def = BLOCKS_CATALOG[blockType]
  if (!def) throw new Error(`Unknown block_type: ${blockType}`)
  if (def.zone !== zone) {
    throw new Error(`Block ${blockType} belongs to zone ${def.zone}, not ${zone}`)
  }

  // compute next display_order
  const { data: existing } = await supabase
    .from('tl_template_blocks')
    .select('display_order')
    .eq('template_id', templateId)
    .eq('zone', zone)
    .order('display_order', { ascending: false })
    .limit(1)

  const nextOrder = (existing && existing[0]?.display_order || 0) + 10

  const { data, error } = await supabase
    .from('tl_template_blocks')
    .insert({
      template_id: templateId,
      zone,
      block_type: blockType,
      display_order: opts.display_order ?? nextOrder,
      config: opts.config || def.defaultConfig || {},
      width: opts.width || def.defaultWidth || '1fr',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Update a block's config / width / display_order.
 * Pass only the fields you want to change in `patch`.
 */
export async function updateBlock(blockId, patch) {
  const allowed = ['config', 'width', 'display_order']
  const payload = {}
  for (const k of allowed) if (k in patch) payload[k] = patch[k]
  if (Object.keys(payload).length === 0) {
    throw new Error('updateBlock: nothing to update')
  }
  const { data, error } = await supabase
    .from('tl_template_blocks')
    .update(payload)
    .eq('id', blockId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Delete a block.
 */
export async function removeBlock(blockId) {
  const { error } = await supabase
    .from('tl_template_blocks')
    .delete()
    .eq('id', blockId)
  if (error) throw error
  return { ok: true }
}

/**
 * Reorder all blocks in a zone in one shot.
 * orderedIds = array of block UUIDs in the new order.
 * Assigns display_order = 10, 20, 30...
 */
export async function reorderBlocks(templateId, zone, orderedIds) {
  if (!Array.isArray(orderedIds)) throw new Error('orderedIds must be an array')
  const updates = orderedIds.map((id, idx) =>
    supabase
      .from('tl_template_blocks')
      .update({ display_order: (idx + 1) * 10 })
      .eq('id', id)
      .eq('template_id', templateId)
      .eq('zone', zone)
  )
  const results = await Promise.all(updates)
  for (const r of results) {
    if (r.error) throw r.error
  }
  return { ok: true, count: orderedIds.length }
}

// ─── PRODUCTION ↔ TEMPLATE (snapshot via duplication) ────────

/**
 * Load the template currently active on a production, with all its blocks
 * and the production-level overrides + logo path.
 * Returns null if no template applied.
 *
 * Returns: {
 *   production_template: { id, production_id, template_id, overrides, logo_storage_path },
 *   template: { id, name, description, ... , blocks: [...] }
 * } | null
 */
export async function loadActiveTemplate(productionId) {
  const { data: pt, error: ptErr } = await supabase
    .from('tl_production_template')
    .select('*')
    .eq('production_id', productionId)
    .maybeSingle()
  if (ptErr) throw ptErr
  if (!pt || !pt.template_id) return null

  const template = await loadTemplate(pt.template_id)
  return { production_template: pt, template }
}

/**
 * Apply a template to a production.
 *
 * Behavior (snapshot via duplication):
 *   1. Duplicates the source template into the user's library
 *      with name "<source name> — <productionName or productionId>"
 *   2. Upserts tl_production_template to point to the new duplicated template.
 *   3. Resets overrides to {} (snapshot is fresh).
 *
 * This means modifying the source template AFTER apply does NOT affect
 * the production. The production now owns its own duplicated template.
 *
 * To re-pull changes later, the user can call applyTemplateToProduction()
 * again with the same sourceTemplateId — this will replace the snapshot.
 */
export async function applyTemplateToProduction(productionId, sourceTemplateId, productionLabel = null) {
  const source = await loadTemplate(sourceTemplateId)
  const newName = productionLabel
    ? `${source.name} — ${productionLabel}`
    : `${source.name} — applied`
  const duplicated = await duplicateTemplate(sourceTemplateId, newName)

  // Upsert production_template
  const { data: existing } = await supabase
    .from('tl_production_template')
    .select('id, template_id')
    .eq('production_id', productionId)
    .maybeSingle()

  let result
  if (existing) {
    const oldTemplateId = existing.template_id
    const { data, error } = await supabase
      .from('tl_production_template')
      .update({
        template_id: duplicated.id,
        overrides: {},
      })
      .eq('production_id', productionId)
      .select()
      .single()
    if (error) throw error
    result = data
    // Best-effort cleanup of the previous snapshot if it looked like an applied copy
    // (i.e. name ends with " — applied" or " — <label>"). We don't delete user-named
    // templates from the library.
    if (oldTemplateId && oldTemplateId !== duplicated.id) {
      const { data: oldTpl } = await supabase
        .from('tl_templates')
        .select('name')
        .eq('id', oldTemplateId)
        .maybeSingle()
      if (oldTpl?.name && / — /.test(oldTpl.name)) {
        await supabase.from('tl_templates').delete().eq('id', oldTemplateId)
      }
    }
  } else {
    const { data, error } = await supabase
      .from('tl_production_template')
      .insert({
        production_id: productionId,
        template_id: duplicated.id,
        overrides: {},
      })
      .select()
      .single()
    if (error) throw error
    result = data
  }

  return { production_template: result, template: duplicated }
}

/**
 * Detach the current template from a production (without deleting it).
 */
export async function detachTemplateFromProduction(productionId) {
  const { error } = await supabase
    .from('tl_production_template')
    .update({ template_id: null, overrides: {} })
    .eq('production_id', productionId)
  if (error) throw error
  return { ok: true }
}

/**
 * Patch the production-level overrides JSON (merges with existing).
 * overrides shape: { [blockId]: { config?: {...}, width?: '...' } }
 */
export async function setProductionOverride(productionId, blockId, patch) {
  const { data: pt } = await supabase
    .from('tl_production_template')
    .select('overrides')
    .eq('production_id', productionId)
    .single()
  const current = pt?.overrides || {}
  const merged = { ...current, [blockId]: { ...(current[blockId] || {}), ...patch } }
  const { data, error } = await supabase
    .from('tl_production_template')
    .update({ overrides: merged })
    .eq('production_id', productionId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Clear override for a single block on a production.
 */
export async function clearProductionOverride(productionId, blockId) {
  const { data: pt } = await supabase
    .from('tl_production_template')
    .select('overrides')
    .eq('production_id', productionId)
    .single()
  const current = pt?.overrides || {}
  // eslint-disable-next-line no-unused-vars
  const { [blockId]: _, ...rest } = current
  const { data, error } = await supabase
    .from('tl_production_template')
    .update({ overrides: rest })
    .eq('production_id', productionId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Set the logo storage path on the production_template.
 * The actual file upload to the `tl-logos` bucket is handled separately.
 */
export async function setLogoStoragePath(productionId, storagePath) {
  const { data, error } = await supabase
    .from('tl_production_template')
    .update({ logo_storage_path: storagePath })
    .eq('production_id', productionId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── LOGO Storage helpers ────────────────────────────────────

const LOGO_BUCKET = 'tl-logos'

/**
 * Upload a logo Blob/File to Supabase Storage for the given production.
 * Path: {productionId}/logo.{ext}
 * Always uses upsert: a new upload replaces the previous logo.
 *
 * Returns the storage path (string) that was written.
 */
export async function uploadProductionLogo(productionId, blob, extension) {
  if (!productionId) throw new Error('uploadProductionLogo: productionId is required')
  const path = `${productionId}/logo.${extension}`

  // 1) Upload (upsert)
  const { error: upErr } = await supabase.storage
    .from(LOGO_BUCKET)
    .upload(path, blob, {
      cacheControl: '3600',
      upsert: true,
      contentType: blob.type || `image/${extension === 'jpg' ? 'jpeg' : extension}`,
    })
  if (upErr) throw upErr

  // 2) Clean up any other logo files with different extensions for this production
  //    (e.g. user uploaded a PNG before, then a JPG — remove the PNG)
  const { data: list } = await supabase.storage
    .from(LOGO_BUCKET)
    .list(productionId, { limit: 100 })
  if (list && list.length > 0) {
    const toRemove = list
      .filter(f => f.name.startsWith('logo.') && f.name !== `logo.${extension}`)
      .map(f => `${productionId}/${f.name}`)
    if (toRemove.length > 0) {
      await supabase.storage.from(LOGO_BUCKET).remove(toRemove)
    }
  }

  // 3) Update tl_production_template.logo_storage_path
  await setLogoStoragePath(productionId, path)

  return path
}

/**
 * Delete the current logo of a production from Storage and clear the DB pointer.
 */
export async function deleteProductionLogo(productionId) {
  if (!productionId) throw new Error('deleteProductionLogo: productionId is required')

  // List and remove all files under {productionId}/
  const { data: list } = await supabase.storage
    .from(LOGO_BUCKET)
    .list(productionId, { limit: 100 })
  if (list && list.length > 0) {
    const paths = list.map(f => `${productionId}/${f.name}`)
    await supabase.storage.from(LOGO_BUCKET).remove(paths)
  }

  // Clear DB pointer
  await setLogoStoragePath(productionId, null)

  return { ok: true }
}

/**
 * Get a signed URL for the current logo of a production.
 * Returns null if no logo is set.
 * Signed URL expires in 1 hour.
 */
export async function getProductionLogoUrl(productionId) {
  if (!productionId) return null
  const { data: pt } = await supabase
    .from('tl_production_template')
    .select('logo_storage_path')
    .eq('production_id', productionId)
    .maybeSingle()
  const path = pt?.logo_storage_path
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(LOGO_BUCKET)
    .createSignedUrl(path, 3600)
  if (error) {
    console.error('[getProductionLogoUrl] signed URL error', error)
    return null
  }
  return data?.signedUrl || null
}

// ─── TEAM CONTACTS (auto-pull from crew + per-row overrides) ─

/**
 * Identify Transport crew members for a production.
 * A member is "transport" if department OR role contains "transport"
 * (case-insensitive).
 */
async function fetchTransportCrew(productionId) {
  // Single round-trip with OR filter on two text columns
  const { data, error } = await supabase
    .from('crew')
    .select('id, full_name, role, department, phone, email')
    .eq('production_id', productionId)
    .or('department.ilike.%transport%,role.ilike.%transport%')
    .order('full_name', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * List all override rows for a production (auto + manual).
 */
async function fetchContactOverrides(productionId) {
  const { data, error } = await supabase
    .from('tl_team_contacts_overrides')
    .select('*')
    .eq('production_id', productionId)
    .order('display_order', { ascending: true })
  if (error) throw error
  return data || []
}

/**
 * Load the resolved list of team contacts for a production.
 * Combines auto-pulled crew with overrides:
 *   - if a crew member has an override row (crew_id = X) → fields are merged,
 *     hidden flag respected
 *   - if a crew member has NO override row → shown with defaults
 *   - rows with crew_id = NULL are manual contacts (always shown if !hidden)
 *
 * Returns: [{
 *   key,           // 'crew:CR0001' or 'manual:<uuid>'
 *   crew_id,       // string|null
 *   override_id,   // uuid|null  (the row id in tl_team_contacts_overrides, if any)
 *   name, role, phone, email,
 *   hidden,
 *   display_order
 * }]
 */
export async function loadResolvedTeamContacts(productionId) {
  if (!productionId) return []

  const [crewList, overrides] = await Promise.all([
    fetchTransportCrew(productionId),
    fetchContactOverrides(productionId),
  ])

  // Build a map of overrides by crew_id (for crew-linked overrides)
  const overrideByCrewId = {}
  const manualOverrides = []
  for (const ov of overrides) {
    if (ov.crew_id) overrideByCrewId[ov.crew_id] = ov
    else manualOverrides.push(ov)
  }

  // Merge crew with overrides
  const fromCrew = crewList.map((c, idx) => {
    const ov = overrideByCrewId[c.id]
    return {
      key: 'crew:' + c.id,
      crew_id: c.id,
      override_id: ov?.id || null,
      name:  ov?.name_override  || c.full_name || '',
      role:  ov?.role_override  || c.role || c.department || '',
      phone: ov?.phone_override || c.phone || '',
      email: ov?.email_override || c.email || '',
      hidden: ov?.hidden || false,
      display_order: ov?.display_order != null ? ov.display_order : (1000 + idx),
    }
  })

  // Manual contacts (crew_id null)
  const fromManual = manualOverrides.map(ov => ({
    key: 'manual:' + ov.id,
    crew_id: null,
    override_id: ov.id,
    name:  ov.name_override  || '',
    role:  ov.role_override  || '',
    phone: ov.phone_override || '',
    email: ov.email_override || '',
    hidden: ov.hidden || false,
    display_order: ov.display_order != null ? ov.display_order : 999,
  }))

  // Combine and sort
  return [...fromCrew, ...fromManual]
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0))
}

/**
 * Upsert an override row for a crew-linked contact.
 * Pass crew_id of an existing crew member + the fields to override.
 */
export async function upsertCrewContactOverride(productionId, crewId, patch) {
  if (!productionId || !crewId) throw new Error('productionId and crewId required')

  // Find existing row
  const { data: existing } = await supabase
    .from('tl_team_contacts_overrides')
    .select('id')
    .eq('production_id', productionId)
    .eq('crew_id', crewId)
    .maybeSingle()

  const payload = {
    production_id: productionId,
    crew_id: crewId,
    name_override:  patch.name_override  ?? null,
    role_override:  patch.role_override  ?? null,
    phone_override: patch.phone_override ?? null,
    email_override: patch.email_override ?? null,
    hidden:         patch.hidden ?? false,
    display_order:  patch.display_order ?? 100,
  }

  if (existing) {
    const { data, error } = await supabase
      .from('tl_team_contacts_overrides')
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase
      .from('tl_team_contacts_overrides')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  }
}

/**
 * Add a new manual contact (not linked to any crew member).
 */
export async function addManualContact(productionId, contact) {
  if (!productionId) throw new Error('productionId required')
  const { data, error } = await supabase
    .from('tl_team_contacts_overrides')
    .insert({
      production_id: productionId,
      crew_id: null,
      name_override:  contact.name  || '',
      role_override:  contact.role  || '',
      phone_override: contact.phone || '',
      email_override: contact.email || '',
      hidden: false,
      display_order: contact.display_order ?? 500,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Update an override row by id. Patch fields directly.
 */
export async function updateContactOverride(overrideId, patch) {
  const allowed = ['name_override','role_override','phone_override','email_override','hidden','display_order']
  const payload = {}
  for (const k of allowed) if (k in patch) payload[k] = patch[k]
  if (Object.keys(payload).length === 0) return null
  const { data, error } = await supabase
    .from('tl_team_contacts_overrides')
    .update(payload)
    .eq('id', overrideId)
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Delete an override row. If it was a manual contact, it's gone.
 * If it was a crew-linked override, the contact reverts to crew defaults.
 */
export async function deleteContactOverride(overrideId) {
  const { error } = await supabase
    .from('tl_team_contacts_overrides')
    .delete()
    .eq('id', overrideId)
  if (error) throw error
  return { ok: true }
}
