// Tipos compartidos por todas las fases del pipeline (navegador y servidor).

export type Ciudad = {
  id: string
  nombre: string
  latitud: number
  longitud: number
}

/** Respuesta de Open-Meteo tal como llega (solo los campos que usamos). */
export type RespuestaOpenMeteo = {
  latitude?: number
  longitude?: number
  utc_offset_seconds?: number
  timezone?: string
  hourly_units?: Record<string, string>
  hourly?: {
    time?: unknown[]
    temperature_2m?: unknown[]
    relative_humidity_2m?: unknown[]
    precipitation?: unknown[]
  }
  [clave: string]: unknown
}

/** Resultado de transformar los arrays paralelos: una fila por posición. */
export type FilaTransformada = {
  /** Posición de la fila dentro de los arrays de la respuesta original. */
  indice: number
  ciudad: string | null
  /** Fecha/hora normalizada a ISO 8601 UTC, o null si no es interpretable. */
  fecha_hora: string | null
  /** Valor original de `time`, sin modificar, para poder explicar rechazos. */
  fecha_original: unknown
  // Los valores se copian tal cual: null, "", undefined o cadenas NO se convierten.
  temperatura_c: unknown
  humedad_pct: unknown
  precipitacion_mm: unknown
}

/** Registro normalizado y válido: lo que se puede subir a Supabase. */
export type Registro = {
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
}

export type RegistroRechazado = {
  fila: FilaTransformada
  motivos: string[]
}

export type ResultadoTransformacion = {
  filas: FilaTransformada[]
  /** Avisos estructurales (p. ej. arrays con longitudes distintas). */
  avisos: string[]
}

export type ResultadoLimpieza = {
  validos: Registro[]
  rechazados: RegistroRechazado[]
}

export type CampoOrden =
  | "ciudad"
  | "fecha_hora"
  | "temperatura_c"
  | "humedad_pct"
  | "precipitacion_mm"

export type Orden = {
  campo: CampoOrden
  direccion: "asc" | "desc"
}

/** Todos los límites son inclusivos; null significa "sin límite". */
export type Filtros = {
  ciudades: string[]
  desde: string | null
  hasta: string | null
  temperaturaMin: number | null
  temperaturaMax: number | null
  humedadMin: number | null
  humedadMax: number | null
  precipitacionMin: number | null
  precipitacionMax: number | null
  soloLluvia: boolean
}
