"use client"

import { useMemo, useState } from "react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { paginar } from "@/lib/etl/filtrado"
import { MOTIVO_DUPLICADO } from "@/lib/etl/limpieza"
import type { RegistroRechazado } from "@/lib/etl/tipos"

import { formatoEntero, Paginacion, Vacio, ValorBruto } from "./comunes"

/** Agrupa "Temperatura: valor nulo (null)" y "Humedad fuera de rango 0–100 % (104)" por tipo. */
function tipoMotivo(motivo: string) {
  return motivo.replace(/ \([^)]*\)$/, "")
}

export function PestanaRechazados({ rechazados }: { rechazados: RegistroRechazado[] }) {
  const [pagina, setPagina] = useState(1)
  const [tamano, setTamano] = useState(25)

  const resumen = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const r of rechazados)
      for (const m of r.motivos) cuenta.set(tipoMotivo(m), (cuenta.get(tipoMotivo(m)) ?? 0) + 1)
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])
  }, [rechazados])

  if (rechazados.length === 0) {
    return (
      <Vacio>
        No hay registros rechazados por calidad. En los datos reales de Open-Meteo es habitual; las pruebas
        automáticas usan fixtures con nulos y duplicados para comprobar estas reglas.
      </Vacio>
    )
  }
  const vista = paginar(rechazados, pagina, tamano)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Descartes por <strong>calidad</strong> (no por filtros). Ningún valor ausente se convierte en cero. En
        duplicados de ciudad + fecha_hora se conserva la primera aparición válida, en el orden de extracción.
      </p>
      <ul className="flex flex-wrap gap-2 text-xs">
        {resumen.map(([motivo, n]) => (
          <li key={motivo} className="rounded-full border px-3 py-1">
            {motivo}: <strong className="tabular-nums">{formatoEntero(n)}</strong>
          </li>
        ))}
      </ul>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ciudad</TableHead>
            <TableHead className="text-end">Índice</TableHead>
            <TableHead>time (original)</TableHead>
            <TableHead className="text-end">Temperatura (°C)</TableHead>
            <TableHead className="text-end">Humedad (%)</TableHead>
            <TableHead className="text-end">Precipitación (mm)</TableHead>
            <TableHead>Motivo del rechazo</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {vista.filas.map(({ fila, motivos }) => (
            <TableRow key={`${fila.ciudad}-${fila.indice}`}>
              <TableCell>{fila.ciudad ?? <ValorBruto valor={null} />}</TableCell>
              <TableCell className="text-end tabular-nums">{fila.indice}</TableCell>
              <TableCell className="font-mono text-xs"><ValorBruto valor={fila.fecha_original} /></TableCell>
              <TableCell className="text-end"><ValorBruto valor={fila.temperatura_c} /></TableCell>
              <TableCell className="text-end"><ValorBruto valor={fila.humedad_pct} /></TableCell>
              <TableCell className="text-end"><ValorBruto valor={fila.precipitacion_mm} /></TableCell>
              <TableCell className="max-w-xs text-xs whitespace-normal">
                {motivos.map((m) => (
                  <span key={m} className={m === MOTIVO_DUPLICADO ? "block text-amber-700 dark:text-amber-400" : "block text-destructive"}>
                    {m}
                  </span>
                ))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Paginacion
        pagina={vista.pagina}
        totalPaginas={vista.totalPaginas}
        total={rechazados.length}
        tamano={tamano}
        etiqueta="rechazados"
        onPagina={setPagina}
        onTamano={(t) => {
          setTamano(t)
          setPagina(1)
        }}
      />
    </div>
  )
}
