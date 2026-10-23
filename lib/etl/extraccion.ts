import type { Ciudad, RespuestaOpenMeteo } from "./tipos"

export const URL_ARCHIVO_OPEN_METEO = "https://archive-api.open-meteo.com/v1/archive"
export const VARIABLES_HORARIAS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
] as const
export const MAX_DIAS_EXTRACCION = 31
/** Primer día disponible en el archivo histórico de Open-Meteo. */
export const FECHA_MINIMA_ARCHIVO = "1940-01-01"

export const CIUDADES: Ciudad[] = [
  { id: "barcelona", nombre: "Barcelona", latitud: 41.3874, longitud: 2.1686 },
  { id: "madrid", nombre: "Madrid", latitud: 40.4168, longitud: -3.7038 },
  { id: "sevilla", nombre: "Sevilla", latitud: 37.3891, longitud: -5.9845 },
  { id: "bilbao", nombre: "Bilbao", latitud: 43.263, longitud: -2.935 },
  { id: "valencia", nombre: "Valencia", latitud: 39.4699, longitud: -0.3763 },
]

export const PERIODO_INICIAL = { inicio: "2026-09-01", fin: "2026-09-30" }

const PATRON_FECHA = /^\d{4}-\d{2}-\d{2}$/

/** Convierte "AAAA-MM-DD" en milisegundos UTC; null si la fecha no existe. */
export function fechaUtc(valor: string): number | null {
  if (!PATRON_FECHA.test(valor)) return null
  const ms = Date.parse(`${valor}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  // Rechaza fechas que JavaScript "corrige" (p. ej. 2026-02-30 → 2026-03-02).
  return new Date(ms).toISOString().slice(0, 10) === valor ? ms : null
}

/** Días naturales entre dos fechas, ambos incluidos. */
export function diasIncluidos(inicio: string, fin: string): number | null {
  const a = fechaUtc(inicio)
  const b = fechaUtc(fin)
  if (a === null || b === null) return null
  return Math.round((b - a) / 86_400_000) + 1
}

export type ValidacionExtraccion = {
  errores: string[]
  dias: number
  registrosPrevistos: number
  peticiones: number
}

/** Hoy en UTC como "AAAA-MM-DD". */
export function hoyUtc(ahora = new Date()): string {
  return ahora.toISOString().slice(0, 10)
}

export function validarConfiguracion(
  ciudades: string[],
  inicio: string,
  fin: string,
  hoy = hoyUtc()
): ValidacionExtraccion {
  const errores: string[] = []
  if (ciudades.length === 0) errores.push("Selecciona al menos una ciudad.")
  for (const id of ciudades) {
    if (!CIUDADES.some((c) => c.id === id)) errores.push(`Ciudad desconocida: ${id}.`)
  }

  const a = fechaUtc(inicio)
  const b = fechaUtc(fin)
  if (a === null) errores.push("La fecha inicial no es válida (formato AAAA-MM-DD).")
  if (b === null) errores.push("La fecha final no es válida (formato AAAA-MM-DD).")

  let dias = 0
  if (a !== null && b !== null) {
    dias = Math.round((b - a) / 86_400_000) + 1
    if (b < a) errores.push("La fecha final debe ser igual o posterior a la inicial.")
    else if (dias > MAX_DIAS_EXTRACCION)
      errores.push(
        `El periodo tiene ${dias} días; el máximo por extracción es ${MAX_DIAS_EXTRACCION}.`
      )
    if (inicio < FECHA_MINIMA_ARCHIVO)
      errores.push(`El archivo histórico empieza el ${FECHA_MINIMA_ARCHIVO}.`)
    if (fin > hoy) errores.push("La fecha final no puede ser posterior a hoy (UTC).")
  }

  return {
    errores,
    dias: Math.max(dias, 0),
    registrosPrevistos: errores.length === 0 ? ciudades.length * dias * 24 : 0,
    peticiones: ciudades.length,
  }
}

export function construirUrl(ciudad: Ciudad, inicio: string, fin: string): string {
  const params = new URLSearchParams({
    latitude: String(ciudad.latitud),
    longitude: String(ciudad.longitud),
    start_date: inicio,
    end_date: fin,
    hourly: VARIABLES_HORARIAS.join(","),
    timezone: "UTC",
    temperature_unit: "celsius",
    precipitation_unit: "mm",
    timeformat: "iso8601",
  })
  return `${URL_ARCHIVO_OPEN_METEO}?${params}`
}

export class ErrorExtraccion extends Error {}

/** Descarga los datos de una ciudad. Lanza ErrorExtraccion con un mensaje en castellano. */
export async function extraerCiudad(
  ciudad: Ciudad,
  inicio: string,
  fin: string,
  signal?: AbortSignal
): Promise<RespuestaOpenMeteo> {
  let respuesta: Response
  try {
    respuesta = await fetch(construirUrl(ciudad, inicio, fin), { signal })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ErrorExtraccion(
      "No se pudo conectar con Open-Meteo (red caída o petición bloqueada)."
    )
  }

  let cuerpo: unknown
  try {
    cuerpo = await respuesta.json()
  } catch {
    throw new ErrorExtraccion(`Respuesta no válida de Open-Meteo (HTTP ${respuesta.status}).`)
  }

  const datos = cuerpo as RespuestaOpenMeteo & { error?: boolean; reason?: string }
  if (!respuesta.ok || datos.error) {
    const motivo = typeof datos.reason === "string" ? datos.reason : "sin detalle"
    throw new ErrorExtraccion(`Open-Meteo respondió HTTP ${respuesta.status}: ${motivo}`)
  }
  return datos
}
