-- Migración: agregar columnas faltantes a la tabla pagos
-- Ejecutar en Supabase SQL Editor (es seguro correr múltiples veces)

ALTER TABLE pagos
  ADD COLUMN IF NOT EXISTS cliente_nombre TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS fecha_pago     DATE,
  ADD COLUMN IF NOT EXISTS banco          TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS referencia     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS tipo_negocio   TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS estado         TEXT DEFAULT 'pendiente',
  ADD COLUMN IF NOT EXISTS creado_por     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS empresa_id     BIGINT,
  ADD COLUMN IF NOT EXISTS validado_por   TEXT,
  ADD COLUMN IF NOT EXISTS validado_en    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;

-- Restaurar empresa_id en pagos existentes que tienen NULL
-- (los toma del cliente al que pertenecen)
UPDATE pagos p
SET empresa_id = c.empresa_id
FROM clientes c
WHERE p.cliente_id = c.id
  AND p.empresa_id IS NULL;
