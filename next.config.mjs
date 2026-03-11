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
  turbopack: {},
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Evita que webpack intente bundlear pdfjs-dist en el servidor.
  // Lo usa directamente como módulo nativo de Node.js (sin canvas, sin worker).
  serverExternalPackages: ['pdfjs-dist'],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
      // Cache para archivos estáticos JS/CSS — 1 año
      {
        source: '/_next/static/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
      // Cache para imágenes y fuentes — 1 mes
      {
        source: '/(.*)\\.(ico|png|jpg|jpeg|svg|woff|woff2)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=2592000, stale-while-revalidate=86400' },
        ],
      },
    ];
  },
};

export default nextConfig;
