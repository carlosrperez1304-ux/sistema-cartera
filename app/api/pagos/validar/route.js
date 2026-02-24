import { db } from "../../../../lib/supabase.js";
import { requireAuth, checkCsrf } from "../../../../lib/security.js";

const ROLES_VALIDAR = ["admin", "supervisor_cobro", "supervisor_contabilidad", "contabilidad"];

export async function POST(req) {
  const csrf = checkCsrf(req);
  if (csrf) return Response.json({ error: csrf.error }, { status: csrf.status });

  const auth = await requireAuth(req);
  if (auth.error) return Response.json({ error: auth.error }, { status: auth.status });

  const rol = auth.session.user.rol || "";
  if (!ROLES_VALIDAR.includes(rol))
    return Response.json({ error: "No tienes permiso para validar pagos" }, { status: 403 });

  const body = await req.json();
  const { pago_id, accion, motivo_rechazo } = body;
  if (!pago_id || !["aprobar", "rechazar"].includes(accion))
    return Response.json({ error: "Datos invalidos" }, { status: 400 });

  const { data: pago } = await db().from("pagos").select("*").eq("id", pago_id).single();
  if (!pago) return Response.json({ error: "Pago no encontrado" }, { status: 404 });
  if (pago.empresa_id !== auth.session.user.empresa_id)
    return Response.json({ error: "No autorizado" }, { status: 403 });
  if (pago.estado !== "pendiente")
    return Response.json({ error: "Solo se pueden validar pagos pendientes" }, { status: 400 });

  if (accion === "rechazar") {
    if (!motivo_rechazo) return Response.json({ error: "Falta motivo de rechazo" }, { status: 400 });
    await db().from("pagos").update({ estado: "rechazado", motivo_rechazo, validado_por: auth.session.user.username, validado_en: new Date().toISOString() }).eq("id", pago_id);
    return Response.json({ ok: true });
  }

  const { data: oblig } = await db().from("obligaciones").select("*").eq("id", pago.obligacion_id).single();
  if (!oblig) return Response.json({ error: "Obligacion no encontrada" }, { status: 404 });

  const nuevo_pagado = parseFloat(oblig.monto_pagado) + parseFloat(pago.monto);
  const nuevo_saldo = parseFloat(oblig.monto_total) - nuevo_pagado;
  const nuevo_estado = nuevo_saldo <= 0 ? "pagado" : "parcial";

  await db().from("obligaciones").update({ monto_pagado: nuevo_pagado, saldo_restante: Math.max(0, nuevo_saldo), estado: nuevo_estado }).eq("id", oblig.id);
  await db().from("pagos").update({ estado: "aprobado", validado_por: auth.session.user.username, validado_en: new Date().toISOString() }).eq("id", pago_id);

  return Response.json({ ok: true });
}
