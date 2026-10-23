import type {
  FilaTransformada,
  Registro,
  RegistroRechazado,
  ResultadoLimpieza,
} from "./tipos"

export const MOTIVO_DUPLICADO =
  "Duplicado de ciudad + fecha_hora (se conserva la primera aparición válida)"

const PATRON_ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/

export function esFechaIsoUtc(valor: unknown): valor is string {
  if (typeof valor !== "string" || !PATRON_ISO_UTC.test(valor)) return false
  const ms = Date.parse(valor)
  return !Number.isNaN(ms) && new Date(ms).toISOString().replace(".000Z", "Z") === valor
}

/** Explica por qué un valor no es una medición numérica utilizable (o null si lo es). */
function problemaNumerico(nombre: string, valor: unknown): string | null {
  if (valor === undefined) return `${nombre}: valor ausente`
  if (valor === null) return `${nombre}: valor nulo (null)`
  if (typeof valor === "string" && valor.trim() === "") return `${nombre}: cadena vacía`
  if (typeof valor !== "number") return `${nombre}: tipo no numérico (${typeof valor})`
  if (!Number.isFinite(valor)) return `${nombre}: número no finito (${valor})`
  return null
}

/**
 * Reglas de calidad de un registro. Se usan en el navegador (fase de limpieza)
 * y otra vez en el servidor antes de escribir en Supabase.
 * Devuelve la lista de motivos de rechazo; vacía si el registro es válido.
 */
export function motivosDeRechazo(fila: {
  ciudad: unknown
  fecha_hora: unknown
  temperatura_c: unknown
  humedad_pct: unknown
  precipitacion_mm: unknown
}): string[] {
  const motivos: string[] = []

  if (typeof fila.ciudad !== "string" || fila.ciudad.trim() === "") motivos.push("Sin ciudad")
  if (!esFechaIsoUtc(fila.fecha_hora)) motivos.push("Fecha/hora ausente o no interpretable como UTC")

  const temperatura = problemaNumerico("Temperatura", fila.temperatura_c)
  if (temperatura) motivos.push(temperatura)
  // Sin umbrales para la temperatura: un valor extremo puede ser real.

  const humedad = problemaNumerico("Humedad", fila.humedad_pct)
  if (humedad) motivos.push(humedad)
  else if ((fila.humedad_pct as number) < 0 || (fila.humedad_pct as number) > 100)
    motivos.push(`Humedad fuera de rango 0–100 % (${fila.humedad_pct})`)

  const precipitacion = problemaNumerico("Precipitación", fila.precipitacion_mm)
  if (precipitacion) motivos.push(precipitacion)
  else if ((fila.precipitacion_mm as number) < 0)
    motivos.push(`Precipitación negativa (${fila.precipitacion_mm} mm)`)

  return motivos
}

export function claveRegistro(r: { ciudad: string; fecha_hora: string }): string {
  return `${r.ciudad}|${r.fecha_hora}`
}

/**
 * Limpieza: valida cada fila y elimina duplicados.
 *
 * Duplicados: se comparan solo las filas que ya han superado las reglas de
 * calidad, en el orden de entrada (orden de ciudades y, dentro de cada ciudad,
 * orden de la respuesta de la API). Se conserva la PRIMERA fila válida y las
 * siguientes se rechazan con MOTIVO_DUPLICADO.
 */
export function limpiar(filas: FilaTransformada[]): ResultadoLimpieza {
  const validos: Registro[] = []
  const rechazados: RegistroRechazado[] = []
  const vistos = new Set<string>()

  for (const fila of filas) {
    const motivos = motivosDeRechazo(fila)
    if (motivos.length > 0) {
      rechazados.push({ fila, motivos })
      continue
    }
    const registro: Registro = {
      ciudad: fila.ciudad as string,
      fecha_hora: fila.fecha_hora as string,
      temperatura_c: fila.temperatura_c as number,
      humedad_pct: fila.humedad_pct as number,
      precipitacion_mm: fila.precipitacion_mm as number,
    }
    const clave = claveRegistro(registro)
    if (vistos.has(clave)) {
      rechazados.push({ fila, motivos: [MOTIVO_DUPLICADO] })
      continue
    }
    vistos.add(clave)
    validos.push(registro)
  }
  return { validos, rechazados }
}
