/** @type {import('next').NextConfig} */
const securityHeaders = [
  // Evita que la app sea embebida en iframes (clickjacking)
  { key: 'X-Frame-Options',         value: 'DENY' },
  // Evita que el navegador adivine el tipo de contenido
  { key: 'X-Content-Type-Options',  value: 'nosniff' },
  // Protección XSS en navegadores legacy
  { key: 'X-XSS-Protection',        value: '1; mode=block' },
  // No enviar referrer a otros dominios
  { key: 'Referrer-Policy',          value: 'strict-origin-when-cross-origin' },
  // Limitar permisos del navegador
  { key: 'Permissions-Policy',       value: 'camera=(), microphone=(), geolocation=()' },
  // Forzar HTTPS (activo solo en producción)
  ...(process.env.NODE_ENV === 'production'
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }]
    : []),
];

const nextConfig = {
  turbopack: {},   // Next.js 16 usa Turbopack por defecto
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
