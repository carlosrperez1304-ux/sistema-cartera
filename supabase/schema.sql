-- ═══════════════════════════════════════════════════════════
-- CartaMaster — Schema de base de datos
-- Copiar y pegar completo en Supabase → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════

-- Clientes de cartera
CREATE TABLE IF NOT EXISTS clientes (
  id                  BIGINT PRIMARY KEY,
  nombre              TEXT NOT NULL,
  contacto            TEXT,
  estado              TEXT DEFAULT 'Cotizado',
  fecha_cotizacion    DATE,
  fecha_notificacion  DATE,
  fecha_pago          DATE,
  fecha_facturacion   DATE,
  fecha_suspension    DATE,
  mes                 TEXT,
  anio                TEXT,
  monto               DECIMAL(15,2),
  comentario          TEXT,
  nota                TEXT,
  suspendido          BOOLEAN DEFAULT FALSE,
  tags                JSONB DEFAULT '[]',
  historial           JSONB DEFAULT '[]',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Pagos registrados por cliente
CREATE TABLE IF NOT EXISTS pagos (
  id            BIGINT PRIMARY KEY,
  cliente_id    BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  monto         DECIMAL(15,2) NOT NULL,
  fecha         TIMESTAMPTZ DEFAULT NOW(),
  fecha_formato TEXT,
  nota          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Créditos / préstamos
CREATE TABLE IF NOT EXISTS creditos (
  id                BIGINT PRIMARY KEY,
  numero_orden      TEXT,
  cliente           TEXT NOT NULL,
  monto             DECIMAL(15,2),
  fecha_inicio      DATE,
  plazo_meses       INTEGER,
  fecha_vencimiento DATE,
  fecha_pago_c      DATE,
  estado            TEXT DEFAULT 'Activo',
  comentario        TEXT,
  historial         JSONB DEFAULT '[]',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Abonos a créditos
CREATE TABLE IF NOT EXISTS abonos (
  id            BIGINT PRIMARY KEY,
  credito_id    BIGINT NOT NULL REFERENCES creditos(id) ON DELETE CASCADE,
  monto         DECIMAL(15,2) NOT NULL,
  fecha         TIMESTAMPTZ DEFAULT NOW(),
  fecha_formato TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Documentos / Cotizaciones PDF (base64)
CREATE TABLE IF NOT EXISTS cotizaciones (
  id          BIGINT PRIMARY KEY,
  cliente_id  BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nombre      TEXT NOT NULL,
  datos       TEXT,         -- base64 del PDF (cargado bajo demanda)
  monto       DECIMAL(15,2),
  fecha       TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Bitácora de gestiones de cobro
CREATE TABLE IF NOT EXISTS gestiones (
  id            BIGINT PRIMARY KEY,
  cliente_id    BIGINT NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  fecha         TIMESTAMPTZ DEFAULT NOW(),
  tipo          TEXT,
  resultado     TEXT,
  nota          TEXT,
  proxima_fecha DATE,
  usuario       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Plantillas de WhatsApp
CREATE TABLE IF NOT EXISTS plantillas (
  id         BIGINT PRIMARY KEY,
  nombre     TEXT NOT NULL,
  texto      TEXT NOT NULL,
  orden      INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Snapshots mensuales (historial de meses)
CREATE TABLE IF NOT EXISTS historial_meses (
  mes_key    TEXT PRIMARY KEY,   -- ej: "2026-01"
  datos      JSONB NOT NULL,     -- { clientes: [...], creditos: [...] }
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configuración y preferencias del sistema
CREATE TABLE IF NOT EXISTS config (
  clave      TEXT PRIMARY KEY,
  valor      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Índices ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pagos_cliente        ON pagos(cliente_id);
CREATE INDEX IF NOT EXISTS idx_abonos_credito       ON abonos(credito_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente ON cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_gestiones_cliente    ON gestiones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_clientes_estado      ON clientes(estado);
CREATE INDEX IF NOT EXISTS idx_creditos_estado      ON creditos(estado);

-- ── Deshabilitar RLS ──────────────────────────────────────────
-- La autenticación se maneja con NextAuth en nuestras API routes.
-- El service_role key bypassa RLS de todas formas.
ALTER TABLE clientes        DISABLE ROW LEVEL SECURITY;
ALTER TABLE pagos           DISABLE ROW LEVEL SECURITY;
ALTER TABLE creditos        DISABLE ROW LEVEL SECURITY;
ALTER TABLE abonos          DISABLE ROW LEVEL SECURITY;
ALTER TABLE cotizaciones    DISABLE ROW LEVEL SECURITY;
ALTER TABLE gestiones       DISABLE ROW LEVEL SECURITY;
ALTER TABLE plantillas      DISABLE ROW LEVEL SECURITY;
ALTER TABLE historial_meses DISABLE ROW LEVEL SECURITY;
ALTER TABLE config          DISABLE ROW LEVEL SECURITY;

-- ── Datos iniciales de configuración ─────────────────────────
INSERT INTO config (clave, valor) VALUES
  ('meta_mensual',     '0'),
  ('color_acento',     '#635bff'),
  ('recordatorio_dias','7'),
  ('modo_compacto',    'false')
ON CONFLICT (clave) DO NOTHING;
