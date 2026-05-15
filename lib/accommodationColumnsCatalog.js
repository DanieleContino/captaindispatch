/**
 * accommodationColumnsCatalog.js
 *
 * Catalog of all configurable columns for /dashboard/accommodation.
 * Used by AccommodationColumnsEditorSidebar and HotelTable in accommodation/page.js.
 *
 * Mirrors the pattern of lib/travelColumnsCatalog.js.
 */

export const ACCOMMODATION_COLUMNS_CATALOG = {
  full_name:          { label: 'Name',         defaultWidth: '160px' },
  role:               { label: 'Role',          defaultWidth: '100px' },
  department:         { label: 'Dept',          defaultWidth: '80px'  },
  room_type_notes:    { label: 'Room / Notes',  defaultWidth: '160px' },
  arrival_date:       { label: 'Check-in',      defaultWidth: '100px' },
  departure_date:     { label: 'Check-out',     defaultWidth: '100px' },
  nights:             { label: 'Nights',        defaultWidth: '56px'  },
  status:             { label: 'Status',        defaultWidth: '130px' },
  notes:              { label: 'Notes',         defaultWidth: '120px' },
  cost_per_night:     { label: '€/night',       defaultWidth: '76px'  },
  city_tax_total:     { label: 'City tax',      defaultWidth: '70px'  },
  total_cost_no_vat:  { label: 'Tot. no VAT',   defaultWidth: '90px'  },
  total_cost_vat:     { label: 'Tot. + VAT',    defaultWidth: '90px'  },
  po_number:          { label: 'P.O.',          defaultWidth: '80px'  },
  invoice_number:     { label: 'N°Fatt.',       defaultWidth: '80px'  },
}

/** Default 9-column layout — applied on first use */
export const ACCOMMODATION_DEFAULT_PRESET = [
  { source_field: 'full_name',       header_label: 'Name',        width: '160px', display_order: 10  },
  { source_field: 'role',            header_label: 'Role',        width: '100px', display_order: 20  },
  { source_field: 'department',      header_label: 'Dept',        width: '80px',  display_order: 30  },
  { source_field: 'room_type_notes', header_label: 'Room / Notes',width: '160px', display_order: 40  },
  { source_field: 'arrival_date',    header_label: 'Check-in',    width: '100px', display_order: 50  },
  { source_field: 'departure_date',  header_label: 'Check-out',   width: '100px', display_order: 60  },
  { source_field: 'nights',          header_label: 'Nights',      width: '56px',  display_order: 70  },
  { source_field: 'status',          header_label: 'Status',      width: '130px', display_order: 80  },
  { source_field: 'notes',           header_label: 'Notes',       width: '120px', display_order: 90  },
]
