import { requireAuth } from '../../../lib/security.js';

// ── Etiquetas que NUNCA son el total final ───────────────────────
const EXCLUIR = [
  'TOTAL DIFERENCIA',
  'TOTAL DESCUENTO',
  'TOTAL BRUTO',
  'TOTAL ITBIS',
  'TOTAL IMPUESTO',
  'TOTAL PARCIAL',
  'TOTAL GRAVADO',
  'TOTAL EXENTO',
  'TOTAL DEVOLUCION',
  'TOTAL DEVOLUCIÓN',
  'TOTAL BASE',
  'TOTAL PROPINA',
];

// ── Etiquetas de alta prioridad (son el total definitivo) ────────
const ALTA_PRIORIDAD = [
  'TOTAL A PAGAR',
  'TOTAL FACTURA',
  'TOTAL GENERAL',
  'TOTAL FINAL',
  'TOTAL NETO',
  'GRAN TOTAL',
  'MONTO TOTAL',
  'IMPORTE TOTAL',
  'TOTAL IMPORTE',
  'TOTAL RD$',
];

// ── Extracción de texto agrupando por coordenada Y con tolerancia ─
// Agrupa items cuya posición Y difiere en ≤2 px como la misma línea.
// Esto evita que columnas de una tabla (etiqueta vs monto) queden
// en líneas distintas por diferencias mínimas de alineación vertical.
async function extraerTextoPDF(buffer) {
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';

  const doc = await pdfjsLib
    .getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
      isEvalSupported: false,
    })
    .promise;

  const todasLasLineas = [];

  for (let p = 1; p <= doc.numPages; p++) {
    const pagina  = await doc.getPage(p);
    const content = await pagina.getTextContent();

    // Agrupar items por posición Y con tolerancia de ±2 px.
    // Columnas de una tabla suelen tener Y idéntico, pero pequeñas
    // diferencias de font baseline pueden separar etiqueta y monto.
    const grupos = []; // [{ yRef, items: [{x, str}] }]

    for (const item of content.items) {
      if (!item.str || !item.str.trim()) continue;
      const rawY = item.transform[5]; // transform = [sx,ky,kx,sy, x, y]
      const rawX = item.transform[4];

      // Buscar un grupo existente cuyo Y de referencia esté a ≤2 px
      const grupo = grupos.find(g => Math.abs(g.yRef - rawY) <= 2);
      if (grupo) {
        grupo.items.push({ x: rawX, str: item.str });
      } else {
        grupos.push({ yRef: rawY, items: [{ x: rawX, str: item.str }] });
      }
    }

    // Ordenar de arriba a abajo (Y mayor = más arriba en coordenadas PDF)
    const lineas = grupos
      .sort((a, b) => b.yRef - a.yRef)
      .map(g =>
        g.items
          .sort((a, b) => a.x - b.x)   // de izquierda a derecha
          .map(i => i.str)
          .join(' ')
          .trim()
      )
      .filter(l => l.length > 0);

    todasLasLineas.push(...lineas);
  }

  return todasLasLineas.join('\n');
}

// ── Extrae el monto TOTAL FINAL del texto ────────────────────────
// Maneja dos layouts de factura:
//   a) Todo en una línea:  "TOTAL RD$ 252,275.37"
//   b) Etiqueta y monto en líneas consecutivas:
//        línea i:   "TOTAL RD$"
//        línea i+1: "252,275.37"
function extraerTotal(texto) {
  const MONTO_RE = /((?:\d{1,3},)*\d{1,3}\.\d{2}|\d+\.\d{2})/g;
  const lineas   = texto.split(/[\r\n]+/);

  let montoAltaPrioridad = null; // "TOTAL A PAGAR", "TOTAL FACTURA"…
  let montoGenerico      = null; // líneas que solo dicen "TOTAL"
  const todosLosCandidatos = []; // todos los candidatos válidos

  for (let i = 0; i < lineas.length; i++) {
    const limpia  = lineas[i].trim();
    const limpiaU = limpia.toUpperCase();

    // Solo líneas que comiencen con "TOTAL" (ignora SUBTOTAL, etc.)
    if (!/^TOTAL/.test(limpiaU)) continue;

    // Descartar etiquetas que nunca son el total final
    if (EXCLUIR.some(ex => limpiaU.startsWith(ex))) continue;

    // Buscar montos numéricos en la línea actual
    let nums = [...limpia.matchAll(MONTO_RE)];

    // Layout b): la etiqueta TOTAL está sola y el monto viene en la
    // siguiente línea (columnas separadas que no se agruparon por Y).
    if (nums.length === 0 && i + 1 < lineas.length) {
      const sigLinea = lineas[i + 1].trim();
      // La siguiente línea debe ser solo un número, no otra etiqueta
      if (!/^TOTAL/i.test(sigLinea.toUpperCase())) {
        nums = [...sigLinea.matchAll(MONTO_RE)];
      }
    }

    if (nums.length === 0) continue;

    // Tomar el ÚLTIMO número (columna de monto en tablas)
    const raw    = nums[nums.length - 1][1];
    const numero = parseFloat(raw.replace(/,/g, ''));
    if (isNaN(numero) || numero <= 0) continue;

    const monto = Math.round(numero * 100) / 100;
    todosLosCandidatos.push(monto);

    if (ALTA_PRIORIDAD.some(p => limpiaU.startsWith(p))) {
      montoAltaPrioridad = monto; // la última etiqueta prioritaria gana
    } else {
      montoGenerico = monto;      // la última línea "TOTAL" genérica
    }
  }

  // Orden de prioridad:
  // 1. Etiqueta prioritaria ("TOTAL A PAGAR", "TOTAL RD$", etc.)
  // 2. "TOTAL" genérico
  // 3. El mayor monto entre todos los candidatos (fallback)
  if (montoAltaPrioridad !== null) return montoAltaPrioridad;
  if (montoGenerico      !== null) return montoGenerico;
  if (todosLosCandidatos.length > 0) return Math.max(...todosLosCandidatos);

  return null;
}

// ── POST /api/leer-pdf ───────────────────────────────────────────
export async function POST(req) {
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  // ?debug=1 → devuelve el texto extraído para diagnóstico (solo en desarrollo)
  const { searchParams } = new URL(req.url);
  const modoDebug = searchParams.get('debug') === '1' &&
                    process.env.NODE_ENV !== 'production';

  try {
    const formData = await req.formData();
    const archivo  = formData.get('pdf');

    if (!archivo || typeof archivo === 'string') {
      return Response.json({ error: 'No se recibió ningún archivo PDF.' }, { status: 400 });
    }
    if (archivo.type !== 'application/pdf') {
      return Response.json({ error: 'El archivo debe ser un PDF válido.' }, { status: 400 });
    }
    if (archivo.size > 10 * 1024 * 1024) {
      return Response.json({ error: 'El PDF no debe superar los 10 MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await archivo.arrayBuffer());
    const texto  = await extraerTextoPDF(buffer);

    // Modo debug: devolver el texto completo para revisar qué extrae el PDF
    if (modoDebug) {
      return Response.json({ debug: true, texto });
    }

    const textoUtil = texto.replace(/\s+/g, ' ').trim();
    if (textoUtil.length < 30) {
      return Response.json(
        { error: 'El PDF parece estar escaneado. Ingresa el monto manualmente.', escaneado: true },
        { status: 422 }
      );
    }

    const monto = extraerTotal(texto);

    if (monto === null) {
      return Response.json(
        {
          error:       'No se encontró el monto total. Verifica que el PDF tenga una línea con "TOTAL".',
          previewTexto: textoUtil.slice(0, 600),
        },
        { status: 422 }
      );
    }

    return Response.json({ monto });

  } catch (err) {
    console.error('[leer-pdf]', err?.message || err);
    return Response.json({ error: 'Error al procesar el PDF.' }, { status: 500 });
  }
}
