// Retorna el ID de deployment actual — cambia con cada deploy en Vercel
export async function GET() {
  return Response.json({
    version: process.env.VERCEL_DEPLOYMENT_ID || 'dev',
  });
}
