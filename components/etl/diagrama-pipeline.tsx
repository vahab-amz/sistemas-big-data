"use client"

import { ArrowDownIcon, ArrowRightIcon, MagnifyingGlassIcon } from "@phosphor-icons/react"
import { cn } from "cn"
import { Fragment } from "react"

import { Estado, formatoDuracion, type EstadoFase } from "./comunes"
import type { Pestana } from "./pipeline-etl"

export type Fase = {
  id: string
  pestana: Pestana
  titulo: string
  descripcion: string
  estado: EstadoFase
  entrada: string
  salida: string
  duracionMs: number | null
  detalle?: string
}

const BORDE: Record<EstadoFase, string> = {
  pendiente: "border-dashed",
  en_curso: "border-sky-500/60",
  completada: "border-emerald-600/40",
  error: "border-destructive/60",
}

export function DiagramaPipeline({
  fases,
  activa,
  onInspeccionar,
}: {
  fases: Fase[]
  activa: Pestana
  onInspeccionar: (p: Pestana) => void
}) {
  return (
    <section aria-labelledby="titulo-pipeline" className="flex flex-col gap-3">
      <h2 id="titulo-pipeline" className="flex items-center gap-2 text-base font-semibold">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">
          2
        </span>
        Visualización del pipeline
      </h2>
      <ol className="flex flex-col items-stretch gap-1 lg:flex-row lg:gap-0">
        {fases.map((fase, i) => (
          <Fragment key={fase.id}>
            <li className="min-w-0 flex-1">
              <button
                type="button"
                onClick={() => onInspeccionar(fase.pestana)}
                aria-label={`${fase.titulo}: ${fase.estado}. Inspeccionar resultados`}
                aria-current={activa === fase.pestana ? "true" : undefined}
                className={cn(
                  "group flex h-full w-full flex-col gap-2 rounded-2xl border-2 bg-card p-3 text-start transition-colors outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/40",
                  BORDE[fase.estado],
                  activa === fase.pestana && "ring-2 ring-primary/40"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-semibold">
                    <span className="text-muted-foreground">{i + 1}. </span>
                    {fase.titulo}
                  </span>
                  <Estado estado={fase.estado} />
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">{fase.descripcion}</p>
                <dl className="mt-auto grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs">
                  <dt className="text-muted-foreground">Entrada</dt>
                  <dd className="font-medium tabular-nums">{fase.entrada}</dd>
                  <dt className="text-muted-foreground">Salida</dt>
                  <dd className="font-medium tabular-nums">{fase.salida}</dd>
                  <dt className="text-muted-foreground">Duración</dt>
                  <dd className="tabular-nums">{formatoDuracion(fase.duracionMs)}</dd>
                </dl>
                {fase.detalle && <p className="text-xs text-muted-foreground">{fase.detalle}</p>}
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary opacity-80 group-hover:opacity-100">
                  <MagnifyingGlassIcon aria-hidden /> Inspeccionar
                </span>
              </button>
            </li>
            {i < fases.length - 1 && (
              <li aria-hidden className="flex items-center justify-center text-muted-foreground lg:px-1">
                <ArrowDownIcon className="size-4 lg:hidden" />
                <ArrowRightIcon className="hidden size-4 lg:block" />
              </li>
            )}
          </Fragment>
        ))}
      </ol>
    </section>
  )
}
