import { requireAuth } from '../../../lib/security.js';

// ── Extracción de texto con pdfjs-dist (ya instalado) ───────────
async function extraerTextoPDF(buffer) {
  // Import dinámico para evitar problemas de inicialización en Next.js
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // Sin worker: no necesario en Node.js (solo extracción de texto)
  pdfjsLib.GlobalWorkerOptions.workerSrc = '';

  const uint8Array = new Uint8Array(buffer);

  const doc = await pdfjsLib
    .getDocument({ data: uint8Array, useWorkerFetch: false, isEvalSupported: false })
    .promise;

  const paginas = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pagina  = await doc.getPage(i);
    const content = await pagina.getTextContent();
    // Reconstruir líneas: los items con salto (hasEOL) separan renglones
    let linea = '';
    const lineasPagina = [];
    for (const item of content.items) {
      if (item.str) linea += item.str;
      if (item.hasEOL) {
        lineasPagina.push(linea.trim());
        linea = '';
      }
    }
    if (linea.trim()) lineasPagina.push(linea.trim());
    paginas.push(lineasPagina.join('\n'));
  }

  return paginas.join('\n');
}

// ── Regex: extrae el TOTAL FINAL del texto ───────────────────────
// Reglas:
//   · La línea debe COMENZAR con "TOTAL" (ignora SUBTOTAL, etc.)
//   · Acepta: TOTAL, TOTAL:, TOTAL A PAGAR, TOTAL RD$, TOTAL FACTURA…
//   · El monto puede ser: 253,632.99 | 15450.00 | 1,200.50 | 875.00
//   · Si hay varias líneas con TOTAL → gana la ÚLTIMA (la más final)
function extraerTotal(texto) {
  const MONTO_RE = /((?:\d{1,3},)*\d{1,3}\.\d{2}|\d+\.\d{2})/g;
  const lineas   = texto.split(/[\r\n]+/);
  let ultimoTotal = null;

  for (const linea of lineas) {
    const limpia  = linea.trim();
    const limpiaU = limpia.toUpperCase();

    // Solo líneas que empiecen con "TOTAL" como palabra (no SUBTOTAL)
    if (!/^TOTAL/.test(limpiaU)) continue;

    const nums = [...limpia.matchAll(MONTO_RE)];
    if (nums.length === 0) continue;

    // El último número de la línea es el monto (columna de totales)
    const raw    = nums[nums.length - 1][1];
    const numero = parseFloat(raw.replace(/,/g, ''));

    if (!isNaN(numero) && numero > 0) {
      ultimoTotal = Math.round(numero * 100) / 100;
    }
  }

  return ultimoTotal;
}

// ── POST /api/leer-pdf ───────────────────────────────────────────
export async function POST(req) {
  // Verificar sesión activa
  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  try {
    const formData = await req.formData();
    const archivo  = formData.get('pdf');

    // Validar que se recibió un archivo
    if (!archivo || typeof archivo === 'string') {
      return Response.json({ error: 'No se recibió ningún archivo PDF.' }, { status: 400 });
    }

    // Validar tipo MIME
    if (archivo.type !== 'application/pdf') {
      return Response.json({ error: 'El archivo debe ser un PDF válido.' }, { status: 400 });
    }

    // Validar tamaño máximo (10 MB)
    const MAX_BYTES = 10 * 1024 * 1024;
    if (archivo.size > MAX_BYTES) {
      return Response.json({ error: 'El PDF no debe superar los 10 MB.' }, { status: 400 });
    }

    // Convertir a Buffer
    const arrayBuffer = await archivo.arrayBuffer();
    const buffer      = Buffer.from(arrayBuffer);

    // Extraer texto del PDF
    const texto = await extraerTextoPDF(buffer);

    // Detectar PDF escaneado (sin texto digital útil)
    const textoUtil = texto.replace(/\s+/g, ' ').trim();
    if (textoUtil.length < 30) {
      return Response.json(
        {
          error:     'El PDF parece estar escaneado y no contiene texto digital. Ingresa el monto manualmente.',
          escaneado: true,
        },
        { status: 422 }
      );
    }

    // Buscar el monto total
    const monto = extraerTotal(texto);

    if (monto === null) {
      return Response.json(
        {
          error:           'No se encontró el monto total. Asegúrate de que el PDF tenga una línea que comience con "TOTAL".',
          previewTexto:    textoUtil.slice(0, 500), // primeros 500 chars para depuración
        },
        { status: 422 }
      );
    }

    return Response.json({ monto });

  } catch (err) {
    console.error('[leer-pdf] Error:', err?.message || err);
    return Response.json(
      { error: 'Error al procesar el PDF. Intenta de nuevo.' },
      { status: 500 }
    );
  }
}
