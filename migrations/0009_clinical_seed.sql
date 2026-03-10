-- Migration 0009: Seed clinical data for demo patient pt-001
-- Adds a sample prescription (Rx) and optical order so the portal
-- /rx, /optical-orders, and dashboard activeRx fields are populated.

-- ── Optical Rx ────────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO optical_rx
  (id, patient_id, exam_id, provider_id,
   rx_date, expires_date,
   od_sphere, od_cylinder, od_axis, od_add, od_pd, od_va,
   os_sphere, os_cylinder, os_axis, os_add, os_pd, os_va,
   binocular_pd, lens_type, provider_name, is_signed, notes,
   created_at, updated_at)
VALUES
  ('rx-001', 'pt-001', NULL, 'dr-chen',
   '2026-02-10', '2028-02-10',
   -2.25, -0.50, 180, 2.00, 31.5, '20/20',
   -1.75, -0.75, 175, 2.00, 32.0, '20/20',
   63.5, 'PROGRESSIVE', 'Dr. Emily Chen', 1,
   'Patient adapted well to progressive design',
   datetime('now'), datetime('now'));

-- ── Optical Order ─────────────────────────────────────────────────────────────
INSERT OR IGNORE INTO optical_orders
  (id, organization_id, patient_id, patient_name, rx_id,
   order_number, order_type, status, lab,
   frame_id, frame_sku, frame_brand, frame_model, frame_color,
   lens_id, lens_sku, lens_name, lens_type,
   od_sphere, od_cylinder, od_axis, od_add, od_pd,
   os_sphere, os_cylinder, os_axis, os_add, os_pd,
   binocular_pd, coating, tint,
   subtotal, discount, insurance_benefit, tax_amount,
   total_charge, deposit_paid, balance_due,
   special_instructions, internal_notes,
   estimated_ready,
   created_at, updated_at)
VALUES
  ('ord-001', 'org-001', 'pt-001', 'Margaret Sullivan', 'rx-001',
   'OPT-260310-0001', 'NEW_RX', 'READY_FOR_PICKUP', 'Vision One Labs',
   'frm-001', 'MJ-WESTSIDE-MB', 'Maui Jim', 'Westside', 'Matte Black 52-18',
   'len-001', 'HI-IDX-167-AR', 'Progressive Hi-Index 1.67 AR Premium', 'PROGRESSIVE',
   -2.25, -0.50, 180, 2.00, 31.5,
   -1.75, -0.75, 175, 2.00, 32.0,
   63.5, 'AR Premium', NULL,
   247.00, 0.00, 0.00, 0.00,
   315.00, 150.00, 165.00,
   'Rush order', NULL,
   '2026-02-16',
   datetime('now'), datetime('now'));

-- ── Superbill for pt-001 ──────────────────────────────────────────────────────
INSERT OR IGNORE INTO superbills
  (id, organization_id, patient_id, patient_name, service_date,
   provider_id, provider_name,
   total_charge, copay_amount, copay_collected,
   insurance_billed, insurance_paid, patient_balance, adjustments,
   status, created_at, updated_at)
VALUES
  ('sb-001', 'org-001', 'pt-001', 'Margaret Sullivan', '2026-02-10',
   'dr-chen', 'Dr. Emily Chen',
   350.00, 30.00, 30.00,
   252.00, 0.00, 68.00, 98.00,
   'SUBMITTED', datetime('now'), datetime('now'));
