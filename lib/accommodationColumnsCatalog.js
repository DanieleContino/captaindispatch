/**
 * accommodationColumnsCatalog.js
 *
 * Catalog of all configurable columns for /dashboard/accommodation.
 * Used by AccommodationColumnsEditorSidebar and HotelTable in accommodation/page.js.
 *
 * Mirrors the pattern of lib/travelColumnsCatalog.js.
 */

export const ACCOMMODATION_COLUMNS_CATALOG = {
  full_name:          { label: 'Name',           defaultWidth: '160px', view_type: 'list' },
  role:               { label: 'Role',            defaultWidth: '100px', view_type: 'list' },
  department:         { label: 'Dept',            defaultWidth: '80px',  view_type: 'list' },
  room_type_notes:    { label: 'Room Type',       defaultWidth: '160px', view_type: 'list' },
  arrival_date:       { label: 'Check-in',        defaultWidth: '100px', view_type: 'list' },
  departure_date:     { label: 'Check-out',       defaultWidth: '100px', view_type: 'list' },
  nights:             { label: 'Nights',          defaultWidth: '56px',  view_type: 'list' },
  status:             { label: 'Status',          defaultWidth: '130px', view_type: 'list' },
  booking_status:     { label: 'Booking Status',  defaultWidth: '110px', view_type: 'list' },
  notes:              { label: 'Notes',           defaultWidth: '120px', view_type: 'list' },
  cost_per_night:     { label: '€/night',         defaultWidth: '76px',  view_type: 'list' },
  city_tax_total:     { label: 'City tax',        defaultWidth: '70px',  view_type: 'list' },
  total_cost_no_vat:  { label: 'Tot. no VAT',     defaultWidth: '90px',  view_type: 'list' },
  total_cost_vat:     { label: 'Tot. + VAT',      defaultWidth: '90px',  view_type: 'list' },
  po_number:          { label: 'P.O.',            defaultWidth: '80px',  view_type: 'list' },
  invoice_number:     { label: 'N°Fatt.',         defaultWidth: '80px',  view_type: 'list' },
  sharing_with:       { label: 'Sharing with',    defaultWidth: '160px', view_type: 'list' },
  extras:             { label: 'Extras',          defaultWidth: '160px', view_type: 'list' },
  cal_po:             { label: 'P.O.',            defaultWidth: '80px',  view_type: 'calendar_cost' },
  cal_inv:            { label: 'N°Fatt.',         defaultWidth: '80px',  view_type: 'calendar_cost' },
  cal_rate_novat:     { label: 'night w/o VAT',   defaultWidth: '76px',  view_type: 'calendar_cost' },
  cal_rate_vat:       { label: 'night w VAT',     defaultWidth: '76px',  view_type: 'calendar_cost' },
  cal_tot_novat:      { label: 'TOT W/O VAT',     defaultWidth: '88px',  view_type: 'calendar_cost' },
  cal_extras:         { label: 'Extras',          defaultWidth: '80px',  view_type: 'calendar_cost' },
  cal_vat_amt:        { label: 'TOT VAT',         defaultWidth: '80px',  view_type: 'calendar_cost' },
  cal_tot_vat:        { label: 'TOT W.VAT',       defaultWidth: '88px',  view_type: 'calendar_cost' },
  cal_city_tax:       { label: 'City Tax',        defaultWidth: '68px',  view_type: 'calendar_cost' },
  cal_tot_novat_tax:  { label: 'Tot W/O VAT+tax', defaultWidth: '100px', view_type: 'calendar_cost' },
  cal_tot_vat_tax:    { label: 'Tot. + City Tax', defaultWidth: '100px', view_type: 'calendar_cost' },
}

/** Default list column layout — applied on first use */
export const ACCOMMODATION_DEFAULT_PRESET = [
  { source_field: 'full_name',       header_label: 'Name',        width: '160px', display_order: 10,  view_type: 'list' },
  { source_field: 'role',            header_label: 'Role',        width: '100px', display_order: 20,  view_type: 'list' },
  { source_field: 'department',      header_label: 'Dept',        width: '80px',  display_order: 30,  view_type: 'list' },
  { source_field: 'room_type_notes', header_label: 'Room Type',   width: '160px', display_order: 40,  view_type: 'list' },
  { source_field: 'arrival_date',    header_label: 'Check-in',    width: '100px', display_order: 50,  view_type: 'list' },
  { source_field: 'departure_date',  header_label: 'Check-out',   width: '100px', display_order: 60,  view_type: 'list' },
  { source_field: 'nights',          header_label: 'Nights',      width: '56px',  display_order: 70,  view_type: 'list' },
  { source_field: 'status',          header_label: 'Status',      width: '130px', display_order: 80,  view_type: 'list' },
  { source_field: 'notes',           header_label: 'Notes',       width: '120px', display_order: 90,  view_type: 'list' },
  { source_field: 'extras',          header_label: 'Extras',      width: '160px', display_order: 100, view_type: 'list' },
]

/** Default calendar cost column layout */
export const CALENDAR_COST_DEFAULT_PRESET = [
  { source_field: 'cal_po',            header_label: 'P.O.',            width: '80px',  display_order: 10,  view_type: 'calendar_cost' },
  { source_field: 'cal_inv',           header_label: 'N°Fatt.',         width: '80px',  display_order: 20,  view_type: 'calendar_cost' },
  { source_field: 'cal_rate_novat',    header_label: 'night w/o VAT',   width: '76px',  display_order: 30,  view_type: 'calendar_cost' },
  { source_field: 'cal_rate_vat',      header_label: 'night w VAT',     width: '76px',  display_order: 40,  view_type: 'calendar_cost' },
  { source_field: 'cal_tot_novat',     header_label: 'TOT W/O VAT',     width: '88px',  display_order: 50,  view_type: 'calendar_cost' },
  { source_field: 'cal_extras',        header_label: 'Extras',          width: '80px',  display_order: 60,  view_type: 'calendar_cost' },
  { source_field: 'cal_vat_amt',       header_label: 'TOT VAT',         width: '80px',  display_order: 70,  view_type: 'calendar_cost' },
  { source_field: 'cal_tot_vat',       header_label: 'TOT W.VAT',       width: '88px',  display_order: 80,  view_type: 'calendar_cost' },
  { source_field: 'cal_city_tax',      header_label: 'City Tax',        width: '68px',  display_order: 90,  view_type: 'calendar_cost' },
  { source_field: 'cal_tot_novat_tax', header_label: 'Tot W/O VAT+tax', width: '100px', display_order: 100, view_type: 'calendar_cost' },
  { source_field: 'cal_tot_vat_tax',   header_label: 'Tot. + City Tax', width: '100px', display_order: 110, view_type: 'calendar_cost' },
]