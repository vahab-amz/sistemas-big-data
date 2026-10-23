import { claveRegistro } from "./limpieza"
import type { CampoOrden, Filtros, Orden, Registro } from "./tipos"

// Orden de operaciones de esta fase:
//   registros válidos → filtros → ordenación → selección → carga
// La paginación es solo una vista sobre el resultado ordenado.

export const FILTROS_VACIOS: Filtros = {
  ciudades: [],
  desde: null,
  hasta: null,
  temperaturaMin: null,
  temperaturaMax: null,
  humedadMin: null,
  humedadMax: null,
  precipitacionMin: null,
  precipitacionMax: null,
  soloLluvia: false,
}

export const ORDEN_INICIAL: Orden = { campo: "fecha_hora", direccion: "asc" }

function dentro(valor: number, min: number | null, max: number | null) {
  return (min === null || valor >= min) && (max === null || valor <= max)
}

export function cumpleFiltros(r: Registro, f: Filtros): boolean {
  if (f.ciudades.length > 0 && !f.ciudades.includes(r.ciudad)) return false
  // fecha_hora, desde y hasta comparten formato ISO UTC, así que se comparan como texto.
  if (f.desde !== null && r.fecha_hora < f.desde) return false
  if (f.hasta !== null && r.fecha_hora > f.hasta) return false
  if (!dentro(r.temperatura_c, f.temperaturaMin, f.temperaturaMax)) return false
  if (!dentro(r.humedad_pct, f.humedadMin, f.humedadMax)) return false
  if (!dentro(r.precipitacion_mm, f.precipitacionMin, f.precipitacionMax)) return false
  if (f.soloLluvia && !(r.precipitacion_mm > 0)) return false
  return true
}

export function filtrar(registros: Registro[], f: Filtros): Registro[] {
  return registros.filter((r) => cumpleFiltros(r, f))
}

const comparadorTexto = new Intl.Collator("es")

function comparar(a: Registro, b: Registro, campo: CampoOrden): number {
  if (campo === "ciudad") return comparadorTexto.compare(a.ciudad, b.ciudad)
  if (campo === "fecha_hora") return a.fecha_hora < b.fecha_hora ? -1 : a.fecha_hora > b.fecha_hora ? 1 : 0
  return a[campo] - b[campo]
}

/** Ordena sin modificar la entrada. Desempata por ciudad y fecha para que el orden sea determinista. */
export function ordenar(registros: Registro[], orden: Orden): Registro[] {
  const signo = orden.direccion === "asc" ? 1 : -1
  return [...registros].sort(
    (a, b) =>
      signo * comparar(a, b, orden.campo) ||
      comparar(a, b, "ciudad") ||
      comparar(a, b, "fecha_hora")
  )
}

export type ResumenSeleccion = {
  /** Registros válidos que cumplen los filtros, ya ordenados. */
  coinciden: Registro[]
  /** Subconjunto seleccionado de `coinciden`, en el mismo orden: lo que se subirá. */
  paraCargar: Registro[]
  /** Filas seleccionadas que existen pero no cumplen los filtros actuales. */
  seleccionadasFueraDeFiltro: number
}

/**
 * Aplica, en este orden, filtros → ordenación → selección.
 * Solo se suben las filas seleccionadas que siguen cumpliendo los filtros.
 */
export function resolverSeleccion(
  validos: Registro[],
  filtros: Filtros,
  orden: Orden,
  seleccion: ReadonlySet<string>
): ResumenSeleccion {
  const coinciden = ordenar(filtrar(validos, filtros), orden)
  const paraCargar = coinciden.filter((r) => seleccion.has(claveRegistro(r)))
  let seleccionadasValidas = 0
  for (const r of validos) if (seleccion.has(claveRegistro(r))) seleccionadasValidas++
  return {
    coinciden,
    paraCargar,
    seleccionadasFueraDeFiltro: seleccionadasValidas - paraCargar.length,
  }
}

export function paginar<T>(filas: T[], pagina: number, tamano: number) {
  const totalPaginas = Math.max(1, Math.ceil(filas.length / tamano))
  const actual = Math.min(Math.max(1, pagina), totalPaginas)
  return {
    filas: filas.slice((actual - 1) * tamano, actual * tamano),
    pagina: actual,
    totalPaginas,
  }
}

/** Divide en lotes de como máximo `tamano` elementos, respetando el orden. */
export function dividirEnLotes<T>(filas: T[], tamano: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < filas.length; i += tamano) lotes.push(filas.slice(i, i + tamano))
  return lotes
}
