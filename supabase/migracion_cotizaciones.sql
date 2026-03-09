-- Migración: agregar columnas estado y tipo a cotizaciones si no existen
ALTER TABLE cotizaciones
  ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'Cotizado',
  ADD COLUMN IF NOT EXISTS tipo   TEXT DEFAULT 'subido';

-- Actualizar registros existentes que queden con NULL
UPDATE cotizaciones SET estado = 'Cotizado' WHERE estado IS NULL;
UPDATE cotizaciones SET tipo   = 'subido'   WHERE tipo IS NULL;
