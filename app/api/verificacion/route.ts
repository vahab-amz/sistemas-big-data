import { TAMANO_LOTE } from "@/lib/etl/carga"
import { CIUDADES } from "@/lib/etl/extraccion"
import { claveRegistro, esFechaIsoUtc } from "@/lib/etl/limpieza"
import {
  TABLA,
  comprobarAcceso,
  leerJson,
  mensajeSupabase,
  normalizarTimestamp,
  obtenerCliente,
  respuestaError,
} from "@/lib/etl/servidor"

/** Fechas por consulta: mantiene la URL de PostgREST en un tamaño razonable. */
const FECHAS_POR_CONSULTA = 100
const NOMBRES = new Set(CIUDADES.map((c) => c.nombre))

// POST /api/verificacion — devuelve qué claves (ciudad|fecha_hora) existen en destino.
export async function POST(request: Request) {
  const denegado = comprobarAcceso()
  if (denegado) return denegado

  const cuerpo = await leerJson(request)
  if ("error" in cuerpo) return cuerpo.error
  const claves = (cuerpo.datos as { claves?: unknown } | null)?.claves
  if (!Array.isArray(claves) || claves.length === 0 || claves.length > TAMANO_LOTE) {
    return respuestaError(400, `Se esperaban entre 1 y ${TAMANO_LOTE} claves.`)
  }

  const porCiudad = new Map<string, string[]>()
  for (const item of claves) {
    const { ciudad, fecha_hora } = (item ?? {}) as { ciudad?: unknown; fecha_hora?: unknown }
    if (typeof ciudad !== "string" || !NOMBRES.has(ciudad) || !esFechaIsoUtc(fecha_hora)) {
      return respuestaError(400, "Clave no válida en la verificación.")
    }
    porCiudad.set(ciudad, [...(porCiudad.get(ciudad) ?? []), fecha_hora])
  }

  const { cliente, error } = obtenerCliente()
  if (!cliente) return error

  const existentes: string[] = []
  let consultas = 0
  for (const [ciudad, fechas] of porCiudad) {
    for (let i = 0; i < fechas.length; i += FECHAS_POR_CONSULTA) {
      consultas++
      const { data, error: errorSupabase } = await cliente
        .from(TABLA)
        .select("ciudad, fecha_hora")
        .eq("ciudad", ciudad)
        .in("fecha_hora", fechas.slice(i, i + FECHAS_POR_CONSULTA))
      if (errorSupabase) return respuestaError(502, mensajeSupabase(errorSupabase))
      for (const fila of data ?? []) {
        const fecha = normalizarTimestamp(fila.fecha_hora)
        if (fecha) existentes.push(claveRegistro({ ciudad: fila.ciudad, fecha_hora: fecha }))
      }
    }
  }
  return Response.json({ existentes, consultas })
}
