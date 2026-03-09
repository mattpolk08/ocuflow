-- OculoFlow Optical Schema Migration 0005
-- Frames, lenses, contact lenses, prescriptions, orders

CREATE TABLE IF NOT EXISTS optical_rx (
  id TEXT PRIMARY KEY,
  patient_id TEXT NOT NULL,
  exam_id TEXT,
  provider_id TEXT,
  rx_date TEXT,
  od_sphere REAL, od_cylinder REAL, od_axis INTEGER, od_add REAL, od_prism REAL, od_base TEXT, od_pd REAL, od_va TEXT,
  os_sphere REAL, os_cylinder REAL, os_axis INTEGER, os_add REAL, os_prism REAL, os_base TEXT, os_pd REAL, os_va TEXT,
  binocular_pd REAL,
  lens_type TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS frames (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  brand TEXT, model TEXT, color TEXT, size TEXT, category TEXT, gender TEXT, material TEXT,
  wholesale REAL DEFAULT 0,
  retail REAL DEFAULT 0,
  insurance_allowance REAL DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 2,
  status TEXT CHECK (status IN ('IN_STOCK','LOW_STOCK','OUT_OF_STOCK','DISCONTINUED')) DEFAULT 'IN_STOCK',
  image_url TEXT, location TEXT, upc TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS lenses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  name TEXT, type TEXT, material TEXT, coating TEXT,
  index_value REAL,
  sphere_min REAL, sphere_max REAL, cylinder_max REAL,
  wholesale REAL DEFAULT 0,
  retail REAL DEFAULT 0,
  insurance_allowance REAL DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 5,
  status TEXT CHECK (status IN ('IN_STOCK','LOW_STOCK','OUT_OF_STOCK','DISCONTINUED')) DEFAULT 'IN_STOCK',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS contact_lenses (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  brand TEXT, product TEXT, modality TEXT, material TEXT,
  sphere_min REAL, sphere_max REAL, cylinder REAL, axis INTEGER,
  base_curve TEXT, diameter REAL,
  wholesale REAL DEFAULT 0,
  retail REAL DEFAULT 0,
  quantity INTEGER DEFAULT 0,
  min_quantity INTEGER DEFAULT 10,
  status TEXT CHECK (status IN ('IN_STOCK','LOW_STOCK','OUT_OF_STOCK','DISCONTINUED')) DEFAULT 'IN_STOCK',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE TABLE IF NOT EXISTS optical_orders (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  patient_name TEXT,
  rx_id TEXT,
  order_number TEXT,
  order_type TEXT,
  status TEXT DEFAULT 'DRAFT',
  frame_id TEXT,
  frame_sku TEXT, frame_brand TEXT, frame_model TEXT, frame_color TEXT,
  lens_id TEXT,
  lens_sku TEXT, lens_name TEXT, lens_type TEXT,
  od_sphere REAL, od_cylinder REAL, od_axis INTEGER, od_add REAL, od_pd REAL,
  os_sphere REAL, os_cylinder REAL, os_axis INTEGER, os_add REAL, os_pd REAL,
  binocular_pd REAL,
  coating TEXT,
  tint TEXT,
  lab TEXT,
  lab_order_number TEXT,
  estimated_ready TEXT,
  lab_sent_at TEXT,
  dispensed_at TEXT,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  insurance_benefit REAL DEFAULT 0,
  tax_amount REAL DEFAULT 0,
  total_charge REAL DEFAULT 0,
  deposit_paid REAL DEFAULT 0,
  balance_due REAL DEFAULT 0,
  special_instructions TEXT,
  internal_notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (organization_id) REFERENCES organizations(id),
  FOREIGN KEY (patient_id) REFERENCES patients(id)
);

CREATE TABLE IF NOT EXISTS optical_order_line_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  item_type TEXT,
  item_id TEXT,
  sku TEXT, name TEXT, description TEXT,
  quantity INTEGER DEFAULT 1,
  unit_retail REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  FOREIGN KEY (order_id) REFERENCES optical_orders(id)
);

CREATE INDEX IF NOT EXISTS idx_optical_rx_patient ON optical_rx(patient_id);
CREATE INDEX IF NOT EXISTS idx_frames_org ON frames(organization_id);
CREATE INDEX IF NOT EXISTS idx_lenses_org ON lenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_cl_org ON contact_lenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_optical_orders_org ON optical_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_optical_orders_patient ON optical_orders(patient_id);
CREATE INDEX IF NOT EXISTS idx_optical_orders_status ON optical_orders(status);
