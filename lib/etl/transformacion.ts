import type { FilaTransformada, RespuestaOpenMeteo, ResultadoTransformacion } from "./tipos"

// Open-Meteo devuelve las horas sin zona ("2026-09-01T00:00"). Como pedimos
// timezone=UTC, añadimos la "Z" de forma explícita en lugar de dejar que el
// navegador las interprete como hora local.
const PATRON_HORA_OPEN_METEO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/

/** Normaliza una hora de Open-Meteo a ISO 8601 UTC ("2026-09-01T00:00:00Z"). */
export function normalizarFechaUtc(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  const m = PATRON_HORA_OPEN_METEO.exec(valor)
  if (!m) return null
  const iso = `${valor}:00Z`
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  // Evita fechas imposibles que Date "corrige" (31 de septiembre, 25:00…).
  if (new Date(ms).toISOString().slice(0, 16) !== valor) return null
  return iso
}

/**
 * Convierte los arrays paralelos de `hourly` en una fila por ciudad y hora.
 *
 * No limpia ni convierte valores: un null sigue siendo null y una cadena sigue
 * siendo cadena. Si los arrays tienen longitudes distintas se genera una fila
 * por cada posición del array más largo; las posiciones que faltan quedan como
 * `undefined` y la fase de limpieza las rechaza indicando el motivo.
 */
export function transformarRespuesta(
  ciudad: string,
  respuesta: RespuestaOpenMeteo
): ResultadoTransformacion {
  const avisos: string[] = []
  const hourly = respuesta.hourly

  // Si la API no respondiera en UTC no podríamos añadir la "Z" sin falsear la
  // hora: en ese caso ninguna fecha se considera interpretable.
  const esUtc = respuesta.utc_offset_seconds === undefined || respuesta.utc_offset_seconds === 0
  if (!esUtc) {
    avisos.push(
      `La respuesta no está en UTC (utc_offset_seconds = ${String(respuesta.utc_offset_seconds)}); se rechazan sus fechas.`
    )
  }
  if (!hourly || typeof hourly !== "object") {
    avisos.push("La respuesta no contiene el bloque `hourly`.")
    return { filas: [], avisos }
  }

  const arrays = {
    time: hourly.time,
    temperature_2m: hourly.temperature_2m,
    relative_humidity_2m: hourly.relative_humidity_2m,
    precipitation: hourly.precipitation,
  }
  for (const [nombre, valor] of Object.entries(arrays)) {
    if (!Array.isArray(valor)) avisos.push(`Falta el array \`${nombre}\` o no es un array.`)
  }

  const longitudes = Object.entries(arrays).map(
    ([nombre, valor]) => [nombre, Array.isArray(valor) ? valor.length : 0] as const
  )
  const total = Math.max(0, ...longitudes.map(([, n]) => n))
  if (new Set(longitudes.map(([, n]) => n)).size > 1) {
    avisos.push(
      "Longitudes incoherentes: " +
        longitudes.map(([nombre, n]) => `${nombre}=${n}`).join(", ") +
        ". Las posiciones sin valor se rechazarán en la limpieza."
    )
  }

  const en = (array: unknown[] | undefined, i: number) =>
    Array.isArray(array) && i < array.length ? array[i] : undefined

  const filas: FilaTransformada[] = []
  for (let i = 0; i < total; i++) {
    const fechaOriginal = en(arrays.time, i)
    filas.push({
      indice: i,
      ciudad: ciudad.trim() === "" ? null : ciudad,
      fecha_hora: esUtc ? normalizarFechaUtc(fechaOriginal) : null,
      fecha_original: fechaOriginal,
      temperatura_c: en(arrays.temperature_2m, i),
      humedad_pct: en(arrays.relative_humidity_2m, i),
      precipitacion_mm: en(arrays.precipitation, i),
    })
  }
  return { filas, avisos }
}

/** Número de horas presentes en `time` (registros brutos recibidos). */
export function contarHorasRecibidas(respuesta: RespuestaOpenMeteo): number {
  const time = respuesta.hourly?.time
  return Array.isArray(time) ? time.length : 0
}
