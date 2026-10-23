import type { EnviarLote, VerificarLote } from "@/lib/etl/carga"

async function postJson(url: string, cuerpo: unknown) {
  let respuesta: Response
  try {
    respuesta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    })
  } catch {
    throw new Error("No se pudo contactar con el servidor de la aplicación.")
  }
  const datos = (await respuesta.json().catch(() => ({}))) as Record<string, unknown>
  if (!respuesta.ok) {
    const detalle = Array.isArray(datos.detalles)
      ? ` Primer problema: fila ${(datos.detalles[0] as { posicion: number }).posicion + 1} → ${(datos.detalles[0] as { motivos: string[] }).motivos.join(", ")}.`
      : ""
    throw new Error(`HTTP ${respuesta.status}: ${String(datos.error ?? "error desconocido")}${detalle}`)
  }
  return datos
}

/** Envía un lote al endpoint de servidor que escribe en Supabase. */
export const enviarLote: EnviarLote = async (registros) => {
  const datos = await postJson("/api/carga", { registros })
  return { procesados: typeof datos.procesados === "number" ? datos.procesados : null }
}

/** Pregunta al servidor qué claves del lote existen ya en la tabla destino. */
export const verificarLote: VerificarLote = async (registros) => {
  const datos = await postJson("/api/verificacion", {
    claves: registros.map(({ ciudad, fecha_hora }) => ({ ciudad, fecha_hora })),
  })
  return Array.isArray(datos.existentes) ? (datos.existentes as string[]) : []
}
