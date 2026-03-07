// ─────────────────────────────────────────────────────────────────────────────
// OculoFlow — Phase 3A: Optical Dispensary Types
// ─────────────────────────────────────────────────────────────────────────────

// ── Frame / Lens Inventory ─────────────────────────────────────────────────

export type FrameCategory = 'FULL_RIM' | 'SEMI_RIM' | 'RIMLESS' | 'SUNGLASSES' | 'SAFETY' | 'PEDIATRIC' | 'SPORTS'
export type FrameGender   = 'MENS' | 'WOMENS' | 'UNISEX' | 'KIDS'
export type FrameStatus   = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'DISCONTINUED' | 'ON_ORDER'

export interface Frame {
  id: string
  sku: string
  brand: string
  model: string
  color: string
  size: string            // e.g. "52-18-140"
  category: FrameCategory
  gender: FrameGender
  material: string        // e.g. "Titanium", "Acetate", "TR-90"
  wholesale: number
  retail: number
  insuranceAllowance?: number
  quantity: number
  minQuantity: number     // reorder point
  status: FrameStatus
  imageUrl?: string
  location?: string       // shelf/bin location
  notes?: string
  createdAt: string
  updatedAt: string
}

export type LensType    = 'SINGLE_VISION' | 'BIFOCAL' | 'TRIFOCAL' | 'PROGRESSIVE' | 'READING' | 'COMPUTER' | 'OCCUPATIONAL'
export type LensMaterial= 'CR39' | 'POLYCARBONATE' | 'TRIVEX' | 'HIGH_INDEX_1_60' | 'HIGH_INDEX_1_67' | 'HIGH_INDEX_1_74' | 'GLASS'
export type LensCoating = 'NONE' | 'AR' | 'AR_PREMIUM' | 'BLUE_LIGHT' | 'PHOTOCHROMIC' | 'POLARIZED' | 'UV_ONLY' | 'MIRROR'
export type LensStatus  = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'DISCONTINUED'

export interface Lens {
  id: string
  sku: string
  name: string
  type: LensType
  material: LensMaterial
  coating: LensCoating
  index?: number          // e.g. 1.67
  sphereRange?: string    // e.g. "+6.00 to -12.00"
  cylRange?: string
  wholesale: number
  retail: number
  insuranceAllowance?: number
  quantity: number
  minQuantity: number
  status: LensStatus
  labTurnaround?: number  // days
  notes?: string
  createdAt: string
  updatedAt: string
}

// ── Optical Prescription ──────────────────────────────────────────────────

export interface EyeRx {
  sphere?: number
  cylinder?: number
  axis?: number
  add?: number
  prism?: number
  base?: string         // e.g. "BI", "BO", "BU", "BD"
  pd?: number           // pupillary distance in mm (monocular)
  va?: string           // visual acuity achieved e.g. "20/20"
}

export interface OpticalRx {
  id: string
  patientId: string
  patientName: string
  examId?: string
  providerId: string
  providerName: string
  rxDate: string
  expiresDate: string   // typically 1-2 years
  od: EyeRx             // right eye
  os: EyeRx             // left eye
  binocularPd?: number  // full binocular PD if single value
  lensType: LensType
  notes?: string
  signed: boolean
  createdAt: string
}

// ── Optical Order (Lab Order) ─────────────────────────────────────────────

export type OrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'SENT_TO_LAB'
  | 'IN_PRODUCTION'
  | 'QUALITY_CHECK'
  | 'RECEIVED'
  | 'READY_FOR_PICKUP'
  | 'DISPENSED'
  | 'CANCELLED'
  | 'REMAKE'

export type OrderType = 'NEW_RX' | 'REMAKE' | 'DUPLICATE' | 'REPAIR' | 'CONTACT_LENS'

export interface OrderLineItem {
  id: string
  type: 'FRAME' | 'LENS' | 'CONTACT_LENS' | 'ACCESSORY' | 'SERVICE'
  itemId: string        // frameId or lensId
  description: string
  quantity: number
  unitCost: number
  unitRetail: number
  discount: number
  total: number
  insuranceCovered?: number
  eye?: 'OD' | 'OS' | 'OU'
}

export interface OpticalOrder {
  id: string
  orderNumber: string
  patientId: string
  patientName: string
  patientPhone?: string
  rxId?: string
  examId?: string
  providerId: string
  providerName: string
  orderType: OrderType
  status: OrderStatus
  lab?: string
  labOrderNumber?: string
  labSentAt?: string
  estimatedReady?: string  // date string
  receivedAt?: string
  dispensedAt?: string
  dispensedBy?: string
  lineItems: OrderLineItem[]
  // Financial
  subtotal: number
  discount: number
  insuranceBenefit: number
  taxAmount: number
  totalCharge: number
  depositPaid: number
  balanceDue: number
  // Rx snapshot (at time of order)
  rx?: OpticalRx
  specialInstructions?: string
  internalNotes?: string
  statusHistory: { status: OrderStatus; at: string; by?: string; note?: string }[]
  createdAt: string
  updatedAt: string
}

// ── Contact Lens Inventory ─────────────────────────────────────────────────

export type CLType      = 'DAILY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'TORIC' | 'MULTIFOCAL' | 'SCLERAL' | 'RGP' | 'ORTHO_K'
export type CLModality  = 'DAILY_DISPOSABLE' | 'EXTENDED_WEAR' | 'CONVENTIONAL'
export type CLStatus    = 'IN_STOCK' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'DISCONTINUED'

export interface ContactLens {
  id: string
  sku: string
  brand: string
  product: string
  type: CLType
  modality: CLModality
  baseCurve?: number
  diameter?: number
  sphere?: number
  cylinder?: number
  axis?: number
  add?: string
  color?: string
  unitsPerBox: number
  wholesale: number
  retail: number
  insuranceAllowance?: number
  quantity: number       // number of boxes
  minQuantity: number
  status: CLStatus
  eye: 'OD' | 'OS' | 'OU'
  notes?: string
  createdAt: string
  updatedAt: string
}

// ── Inventory Summary & Alerts ─────────────────────────────────────────────

export interface InventoryAlert {
  itemId: string
  itemType: 'FRAME' | 'LENS' | 'CONTACT_LENS'
  sku: string
  name: string
  currentQty: number
  minQty: number
  status: FrameStatus | LensStatus | CLStatus
}

export interface InventorySummary {
  totalFrames: number
  totalLenses: number
  totalContactLenses: number
  lowStockAlerts: InventoryAlert[]
  outOfStockAlerts: InventoryAlert[]
  totalInventoryValue: number
  totalRetailValue: number
}

// ── Orders Summary ─────────────────────────────────────────────────────────

export interface OrdersSummary {
  totalOrders: number
  draftOrders: number
  inProgressOrders: number
  readyForPickup: number
  dispensedToday: number
  overdueOrders: number
  totalRevenue: number
  avgTurnaround: number  // days
}

// ── API helpers ────────────────────────────────────────────────────────────

export interface OpticalApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface FrameCreateInput extends Omit<Frame, 'id' | 'createdAt' | 'updatedAt' | 'status'> {
  status?: FrameStatus
}

export interface LensCreateInput extends Omit<Lens, 'id' | 'createdAt' | 'updatedAt' | 'status'> {
  status?: LensStatus
}

export interface OrderCreateInput {
  patientId: string
  patientName: string
  patientPhone?: string
  rxId?: string
  examId?: string
  providerId: string
  providerName: string
  orderType: OrderType
  lab?: string
  estimatedReady?: string
  lineItems: Omit<OrderLineItem, 'id'>[]
  rx?: Partial<OpticalRx>
  specialInstructions?: string
  internalNotes?: string
  insuranceBenefit?: number
  depositPaid?: number
  discount?: number
  taxAmount?: number
}
