import { dividirEnLotes } from "./filtrado"
import { claveRegistro } from "./limpieza"
import type { Registro } from "./tipos"

export const TAMANO_LOTE = 500

export type EstadoVerificacion =
  | { estado: "pendiente" }
  | { estado: "verificando" }
  | { estado: "correcta"; encontrados: number }
  | { estado: "incompleta"; encontrados: number; faltan: string[] }
  | { estado: "error"; error: string }

export type Lote = {
  numero: number
  /** Copia congelada de los registros del lote, en el orden de la vista previa. */
  registros: readonly Registro[]
  estado: "pendiente" | "enviando" | "correcto" | "error"
  intentos: number
  /** Filas afectadas según Supabase (inserciones + actualizaciones, no distinguibles). */
  procesados: number | null
  error: string | null
  duracionMs: number | null
  verificacion: EstadoVerificacion
}

/**
 * Congela el conjunto seleccionado y su orden. A partir de aquí los cambios de
 * filtros o de selección en la interfaz no afectan a la carga.
 */
export function prepararLotes(registros: Registro[], tamano = TAMANO_LOTE): Lote[] {
  const copia = registros.map((r) => Object.freeze({ ...r }))
  return dividirEnLotes(copia, tamano).map((grupo, i) => ({
    numero: i + 1,
    registros: Object.freeze(grupo),
    estado: "pendiente",
    intentos: 0,
    procesados: null,
    error: null,
    duracionMs: null,
    verificacion: { estado: "pendiente" },
  }))
}

export type EnviarLote = (registros: readonly Registro[]) => Promise<{ procesados: number | null }>
/** Devuelve las claves (ciudad|fecha_hora) que existen en destino. */
export type VerificarLote = (registros: readonly Registro[]) => Promise<string[]>

/**
 * Envía en orden los lotes pendientes o fallidos (los correctos no se repiten)
 * y después verifica en destino los lotes enviados correctamente.
 * Si un lote falla se anota el error y se continúa con el siguiente; el upsert
 * por (ciudad, fecha_hora) hace que reintentar no duplique filas.
 */
export async function ejecutarCarga(
  lotesIniciales: Lote[],
  enviar: EnviarLote,
  verificar: VerificarLote,
  alCambiar: (lotes: Lote[]) => void
): Promise<Lote[]> {
  let lotes = lotesIniciales
  const actualizar = (i: number, cambios: Partial<Lote>) => {
    lotes = lotes.map((l, j) => (j === i ? { ...l, ...cambios } : l))
    alCambiar(lotes)
  }

  for (let i = 0; i < lotes.length; i++) {
    if (lotes[i].estado === "correcto") continue
    actualizar(i, { estado: "enviando", error: null, verificacion: { estado: "pendiente" } })
    const inicio = performance.now()
    try {
      const { procesados } = await enviar(lotes[i].registros)
      actualizar(i, {
        estado: "correcto",
        procesados,
        intentos: lotes[i].intentos + 1,
        duracionMs: performance.now() - inicio,
      })
    } catch (error) {
      actualizar(i, {
        estado: "error",
        error: error instanceof Error ? error.message : String(error),
        intentos: lotes[i].intentos + 1,
        duracionMs: performance.now() - inicio,
      })
    }
  }

  for (let i = 0; i < lotes.length; i++) {
    const lote = lotes[i]
    if (lote.estado !== "correcto" || lote.verificacion.estado === "correcta") continue
    actualizar(i, { verificacion: { estado: "verificando" } })
    try {
      const existentes = new Set(await verificar(lote.registros))
      const faltan = lote.registros.map(claveRegistro).filter((c) => !existentes.has(c))
      const encontrados = lote.registros.length - faltan.length
      actualizar(i, {
        verificacion:
          faltan.length === 0
            ? { estado: "correcta", encontrados }
            : { estado: "incompleta", encontrados, faltan },
      })
    } catch (error) {
      actualizar(i, {
        verificacion: {
          estado: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      })
    }
  }
  return lotes
}

export function resumirCarga(lotes: Lote[]) {
  let enviadosOk = 0
  let fallidos = 0
  let verificados = 0
  let procesadosSegunSupabase: number | null = 0
  for (const l of lotes) {
    if (l.estado === "correcto") {
      enviadosOk += l.registros.length
      procesadosSegunSupabase =
        procesadosSegunSupabase === null || l.procesados === null
          ? null
          : procesadosSegunSupabase + l.procesados
    }
    if (l.estado === "error") fallidos += l.registros.length
    if (l.verificacion.estado === "correcta" || l.verificacion.estado === "incompleta")
      verificados += l.verificacion.encontrados
  }
  return {
    total: lotes.reduce((n, l) => n + l.registros.length, 0),
    enviadosOk,
    fallidos,
    verificados,
    // Sin lotes correctos no hay ningún recuento de Supabase que mostrar.
    procesadosSegunSupabase: enviadosOk === 0 ? null : procesadosSegunSupabase,
    lotesFallidos: lotes.filter((l) => l.estado === "error").length,
    enCurso: lotes.some((l) => l.estado === "enviando" || l.verificacion.estado === "verificando"),
  }
}
