-- Ejecutar en Supabase SQL Editor
-- Tabla de activaciones para la app de escritorio CartaMaster

CREATE TABLE IF NOT EXISTS activaciones (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo           text UNIQUE NOT NULL,
  nombre_agente    text NOT NULL,
  activo           boolean DEFAULT true,
  device_id        text,
  fecha_activacion timestamptz,
  empresa_id       int DEFAULT 1,
  created_at       timestamptz DEFAULT now()
);

-- Índice para búsqueda rápida por código
CREATE INDEX IF NOT EXISTS idx_activaciones_codigo ON activaciones(codigo);

-- RLS: permitir acceso solo con service role key (desde el servidor Next.js)
ALTER TABLE activaciones ENABLE ROW LEVEL SECURITY;

-- Política: solo el service role puede leer/escribir
CREATE POLICY "service_role_only" ON activaciones
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
