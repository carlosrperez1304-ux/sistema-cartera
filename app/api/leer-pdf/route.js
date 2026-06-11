import { requireAuth } from "../../../lib/security.js";
import { extractText } from "unpdf";

const EXCLUIR = ["TOTAL DIFERENCIA","TOTAL DESCUENTO","TOTAL BRUTO","TOTAL ITBIS","TOTAL IMPUESTO","TOTAL PARCIAL","TOTAL GRAVADO","TOTAL EXENTO","TOTAL DEVOLUCION","TOTAL DEVOLUCIÓN","TOTAL BASE","TOTAL PROPINA"];
const ALTA_PRIORIDAD = ["TOTAL A PAGAR","TOTAL FACTURA","TOTAL GENERAL","TOTAL FINAL","TOTAL NETO","GRAN TOTAL","MONTO TOTAL","IMPORTE TOTAL","TOTAL IMPORTE","TOTAL RD$"];

function extraerTotal(texto) {
  const MONTO_RE = /((?:\d{1,3},)*\d{1,3}\.\d{2}|\d+\.\d{2})/g;
  const lineas = texto.split(/[\r\n]+/);
  let montoAltaPrioridad = null, montoGenerico = null;
  const todosLosCandidatos = [];
  for (let i = 0; i < lineas.length; i++) {
    const limpia = lineas[i].trim();
    const limpiaU = limpia.toUpperCase();
    if (!/^TOTAL/.test(limpiaU)) continue;
    if (EXCLUIR.some(ex => limpiaU.startsWith(ex))) continue;
    let nums = [...limpia.matchAll(MONTO_RE)];
    if (nums.length === 0) {
      for (let j = i + 1; j < Math.min(i + 10, lineas.length); j++) {
        const sig = lineas[j].trim();
        if (/^TOTAL/i.test(sig.toUpperCase()) && !ALTA_PRIORIDAD.some(p => sig.toUpperCase().startsWith(p))) break;
        const found = [...sig.matchAll(MONTO_RE)];
        if (found.length > 0) { nums = found; }
      }
    }
    if (nums.length === 0) continue;
    const numero = parseFloat(nums[nums.length - 1][1].replace(/,/g, ""));
    if (isNaN(numero) || numero <= 0) continue;
    const monto = Math.round(numero * 100) / 100;
    todosLosCandidatos.push(monto);
    if (ALTA_PRIORIDAD.some(p => limpiaU.startsWith(p))) montoAltaPrioridad = monto;
    else montoGenerico = monto;
  }
  if (montoAltaPrioridad !== null) return montoAltaPrioridad;
  if (montoGenerico !== null) return montoGenerico;
  if (todosLosCandidatos.length > 0) return Math.max(...todosLosCandidatos);
  return null;
}

export async function POST(req) {
  // Permitir sin auth si viene con base64 (desde Electron watcher)
  const contentType = req.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const { base64, filename } = await req.json();
      if (!base64) return Response.json({ error: 'No base64' }, { status: 400 });
      const buffer = Buffer.from(base64, 'base64');
      const { text: textoArr } = await extractText(new Uint8Array(buffer), { mergePages: false });
      const textoRaw = Array.isArray(textoArr) ? textoArr.join('\n') : textoArr;
      const texto = textoRaw.replace(/([^\n])(?=TOTAL\s)/g, '$1\n').replace(/\n+/g, '\n').trim();
      const textoFix = texto.replace(/([^\n])(?=TOTAL\s)/g, '$1\n');
      const monto = extraerTotal(textoFix);
      if (monto === null) return Response.json({ error: 'No se encontró monto' }, { status: 422 });
      return Response.json({ monto });
    } catch(err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });
  const { searchParams } = new URL(req.url);
  const modoDebug = searchParams.get("debug") === "1" && process.env.NODE_ENV !== "production";
  try {
    const formData = await req.formData();
    const archivo = formData.get("pdf");
    if (!archivo || typeof archivo === "string") return Response.json({ error: "No se recibio ningun archivo PDF." }, { status: 400 });
    if (archivo.type !== "application/pdf") return Response.json({ error: "El archivo debe ser un PDF valido." }, { status: 400 });
    if (archivo.size > 10 * 1024 * 1024) return Response.json({ error: "El PDF no debe superar los 10 MB." }, { status: 400 });
    const buffer = Buffer.from(await archivo.arrayBuffer());
    const { text: textoArr } = await extractText(new Uint8Array(buffer), { mergePages: false });
    const textoRaw = Array.isArray(textoArr) ? textoArr.join("\n") : textoArr;
    const texto = textoRaw.replace(/([^\n])(?=TOTAL\s)/g, "$1\n").replace(/\n+/g, "\n").trim();
    if (modoDebug) return Response.json({ debug: true, texto });
    const textoUtil = texto.replace(/\s+/g, " ").trim();
    if (textoUtil.length < 30) return Response.json({ error: "El PDF parece estar escaneado.", escaneado: true }, { status: 422 });
    const textoFix = texto.replace(/([^\n])(?=TOTAL\s)/g, '$1\n');
    const monto = extraerTotal(textoFix);
    if (monto === null) return Response.json({ error: "No se encontro el monto total.", previewTexto: textoUtil.slice(0, 600) }, { status: 422 });
    return Response.json({ monto });
  } catch (err) {
    console.error("[leer-pdf]", err?.message || err);
    return Response.json({ error: "Error al procesar el PDF." }, { status: 500 });
  }
}
