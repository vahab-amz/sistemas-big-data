"use client"

import {
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { cn } from "cn"

import { Button } from "@/components/ui/button"

export type EstadoFase = "pendiente" | "en_curso" | "completada" | "error"

const ESTADOS: Record<EstadoFase, { texto: string; clase: string; Icono: typeof CheckCircleIcon }> = {
  pendiente: { texto: "Pendiente", clase: "text-muted-foreground", Icono: CircleDashedIcon },
  en_curso: { texto: "En curso", clase: "text-sky-700 dark:text-sky-300", Icono: SpinnerGapIcon },
  completada: {
    texto: "Completada",
    clase: "text-emerald-700 dark:text-emerald-400",
    Icono: CheckCircleIcon,
  },
  error: { texto: "Con errores", clase: "text-destructive", Icono: WarningCircleIcon },
}

/** Estado con icono y texto: no depende solo del color. */
export function Estado({
  estado,
  texto,
  className,
}: {
  estado: EstadoFase
  texto?: string
  className?: string
}) {
  const { texto: base, clase, Icono } = ESTADOS[estado]
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", clase, className)}>
      <Icono
        aria-hidden
        weight={estado === "completada" ? "fill" : "bold"}
        className={cn("size-4", estado === "en_curso" && "animate-spin")}
      />
      {texto ?? base}
    </span>
  )
}

const numeros = new Intl.NumberFormat("es-ES")
const decimales = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 })

export function formatoEntero(n: number) {
  return numeros.format(n)
}

export function formatoNumero(n: number) {
  return decimales.format(n)
}

export function formatoDuracion(ms: number | null | undefined) {
  if (ms === null || ms === undefined) return "—"
  if (ms < 1) return `${ms.toFixed(2)} ms`
  if (ms < 1000) return `${ms.toFixed(1)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/** "2026-09-01T05:00:00Z" → "2026-09-01 05:00 UTC" (sin convertir a la hora local). */
export function formatoFechaUtc(iso: string | null | undefined) {
  if (!iso) return "—"
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/** Muestra un valor original sin ocultar null, undefined ni cadenas vacías. */
export function ValorBruto({ valor }: { valor: unknown }) {
  if (valor === null) return <span className="font-mono text-xs text-destructive">null</span>
  if (valor === undefined) return <span className="font-mono text-xs text-destructive">(ausente)</span>
  if (typeof valor === "string")
    return <span className="font-mono text-xs text-amber-700 dark:text-amber-400">{JSON.stringify(valor)}</span>
  if (typeof valor === "number") return <span className="tabular-nums">{formatoNumero(valor)}</span>
  return <span className="font-mono text-xs">{JSON.stringify(valor)}</span>
}

export function Paginacion({
  pagina,
  totalPaginas,
  total,
  tamano,
  onPagina,
  onTamano,
  etiqueta = "filas",
}: {
  pagina: number
  totalPaginas: number
  total: number
  tamano: number
  onPagina: (p: number) => void
  onTamano?: (t: number) => void
  etiqueta?: string
}) {
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1
  const hasta = Math.min(pagina * tamano, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs text-muted-foreground">
      <span aria-live="polite">
        {formatoEntero(desde)}–{formatoEntero(hasta)} de {formatoEntero(total)} {etiqueta}
      </span>
      <div className="flex items-center gap-2">
        {onTamano && (
          <label className="flex items-center gap-1">
            Por página
            <SelectorNativo
              value={String(tamano)}
              onChange={(e) => onTamano(Number(e.target.value))}
              className="h-7 w-auto"
            >
              {[25, 50, 100].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectorNativo>
          </label>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPagina(pagina - 1)}
          disabled={pagina <= 1}
          aria-label="Página anterior"
        >
          <CaretLeftIcon />
        </Button>
        <span className="tabular-nums">
          Página {pagina} / {totalPaginas}
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onPagina(pagina + 1)}
          disabled={pagina >= totalPaginas}
          aria-label="Página siguiente"
        >
          <CaretRightIcon />
        </Button>
      </div>
    </div>
  )
}

export function SelectorNativo({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

/** Descarga un objeto como archivo JSON desde el navegador. */
export function descargarJson(nombre: string, datos: unknown) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
