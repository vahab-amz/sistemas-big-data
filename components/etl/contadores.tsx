"use client"

import { WarningIcon } from "@phosphor-icons/react"

import { formatoEntero } from "./comunes"

export function Contadores({
  total,
  validos,
  rechazados,
  coinciden,
  seleccionados,
  fueraDeFiltro,
}: {
  total: number
  validos: number
  rechazados: number
  coinciden: number
  seleccionados: number
  fueraDeFiltro: number
}) {
  const items = [
    { titulo: "Total extraído", valor: total, ayuda: "Filas tras transformar los JSON" },
    { titulo: "Válidos", valor: validos, ayuda: "Superan la limpieza" },
    { titulo: "Rechazados", valor: rechazados, ayuda: "Descartados por calidad" },
    { titulo: "Coinciden con los filtros", valor: coinciden, ayuda: "Válidos que cumplen los filtros" },
    { titulo: "Seleccionados para cargar", valor: seleccionados, ayuda: "Seleccionados y dentro de los filtros", destacado: true },
  ]
  return (
    <section aria-label="Contadores del pipeline" className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div
            key={it.titulo}
            className={
              it.destacado
                ? "rounded-2xl border-2 border-primary/40 bg-primary/5 p-3"
                : "rounded-2xl border bg-card p-3"
            }
          >
            <dt className="text-xs font-medium text-muted-foreground">{it.titulo}</dt>
            <dd className="text-2xl font-semibold tabular-nums">{formatoEntero(it.valor)}</dd>
            <dd className="text-xs text-muted-foreground">{it.ayuda}</dd>
          </div>
        ))}
      </dl>
      {fueraDeFiltro > 0 && (
        <p className="flex items-center gap-1.5 text-sm text-amber-700 dark:text-amber-400" role="status">
          <WarningIcon aria-hidden weight="bold" />
          {formatoEntero(fueraDeFiltro)} fila(s) seleccionada(s) quedan fuera de los filtros actuales y no se subirán.
        </p>
      )}
    </section>
  )
}
