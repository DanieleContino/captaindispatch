/**
 * travelColumnsCatalog.js
 * Session S55 · 12 May 2026
 *
 * Catalog of all configurable columns for /dashboard/travel.
 * Used by TravelColumnsEditorSidebar and SectionTable in travel/page.js.
 *
 * Each entry:
 *   label        — human-readable name shown in the editor
 *   defaultWidth — initial column width
 *
 * TRAVEL_DEFAULT_PRESET — full 13-column default layout applied on first use.
 */

export const TRAVEL_COLUMNS_CATALOG = {
  direction:       { label: 'Dir',      defaultWidth: '52px' },
  full_name:       { label: 'Name',     defaultWidth: '130px' },
  crew_role:       { label: 'Role',     defaultWidth: '80px' },
  pickup_dep:      { label: 'p/up dep', defaultWidth: '90px' },
  from_location:   { label: 'From',     defaultWidth: '80px' },
  from_time:       { label: 'Dep',      defaultWidth: '56px' },
  to_location:     { label: 'To',       defaultWidth: '80px' },
  to_time:         { label: 'Arr',      defaultWidth: '56px' },
  travel_number:   { label: 'Travel #', defaultWidth: '76px' },
  pickup_arr:      { label: 'p/up arr', defaultWidth: '90px' },
  needs_transport: { label: '🚐',       defaultWidth: '38px' },
  notes:           { label: 'Notes',    defaultWidth: '120px' },
  match_status:    { label: 'Match',    defaultWidth: '44px' },
}

/** Default 13-column layout — applied via "Apply Default Preset" button */
export const TRAVEL_DEFAULT_PRESET = [
  { source_field: 'direction',       header_label: 'Dir',      width: '52px',  display_order: 10  },
  { source_field: 'full_name',       header_label: 'Name',     width: '130px', display_order: 20  },
  { source_field: 'crew_role',       header_label: 'Role',     width: '80px',  display_order: 30  },
  { source_field: 'pickup_dep',      header_label: 'p/up dep', width: '90px',  display_order: 40  },
  { source_field: 'from_location',   header_label: 'From',     width: '80px',  display_order: 50  },
  { source_field: 'from_time',       header_label: 'Dep',      width: '56px',  display_order: 60  },
  { source_field: 'to_location',     header_label: 'To',       width: '80px',  display_order: 70  },
  { source_field: 'to_time',         header_label: 'Arr',      width: '56px',  display_order: 80  },
  { source_field: 'travel_number',   header_label: 'Travel #', width: '76px',  display_order: 90  },
  { source_field: 'pickup_arr',      header_label: 'p/up arr', width: '90px',  display_order: 100 },
  { source_field: 'needs_transport', header_label: '🚐',       width: '38px',  display_order: 110 },
  { source_field: 'notes',           header_label: 'Notes',    width: '120px', display_order: 120 },
  { source_field: 'match_status',    header_label: 'Match',    width: '44px',  display_order: 130 },
]
