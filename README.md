# Pipeline ETL: Open-Meteo → Supabase

Primera práctica de Big Data. La aplicación extrae mediciones horarias históricas de
[Open-Meteo](https://open-meteo.com/en/docs/historical-weather-api), las transforma, limpia y filtra,
y carga en Supabase **solo** los registros que elijas. Cada fase muestra su estado, registros de
entrada/salida y duración real.

Stack: Next.js 16 (App Router), TypeScript, Tailwind CSS 4, shadcn/ui (Base UI), Supabase y Vitest.

## Instalación

```bash
npm install
cp .env.example .env.local   # y rellena los valores
```

## Configuración

| Variable | Dónde se usa | Valor |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | servidor y navegador | Dashboard → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | navegador | clave publicable (`sb_publishable_…`) o `anon` |
| `SUPABASE_SECRET_KEY` | **solo servidor** | clave secreta (`sb_secret_…`) o `service_role` |
| `ETL_PERMITIR_SIN_AUTENTICACION` | servidor, opcional | `true` solo si aceptas exponer los endpoints en producción |

Crea la tabla aplicando la migración
[`supabase/migrations/20261023120000_crear_mediciones_meteorologicas.sql`](supabase/migrations/20261023120000_crear_mediciones_meteorologicas.sql):
pega su contenido en **Dashboard → SQL Editor** y ejecútalo, o usa `supabase db push` con la CLI.

## Ejecución

```bash
npm run dev               # http://localhost:3000
npm test                  # pruebas unitarias con fixtures controlados
npm run test:integracion  # Open-Meteo real y, con la app en marcha y Supabase configurado, carga real
npm run typecheck && npm run build
```

`test:integracion` usa `http://localhost:3000`; cámbialo con `ETL_BASE_URL`.

## El pipeline

1. **Extracción**: una petición por ciudad a `https://archive-api.open-meteo.com/v1/archive` con
   `temperature_2m`, `relative_humidity_2m` y `precipitation`, `timezone=UTC`, °C y mm. Máximo 31 días.
   Las peticiones van una tras otra, así se ve qué ciudades están procesadas y cuáles pendientes.
   El JSON original se guarda en memoria durante la sesión y se puede descargar. Si una ciudad falla,
   se reintenta solo esa ciudad. Su respuesta sustituye a la anterior, así que no se duplican datos.
2. **Transformación**: los arrays paralelos de `hourly` se convierten en un registro por ciudad y hora
   (`ciudad, fecha_hora, temperatura_c, humedad_pct, precipitacion_mm`). La hora sin zona
   (`2026-09-01T00:00`) se interpreta explícitamente como UTC (`2026-09-01T00:00:00Z`). Los valores se
   copian sin convertir. Se avisa si los arrays tienen longitudes distintas.
3. **Limpieza**: se rechazan, con su motivo, los registros sin ciudad, sin fecha válida o con alguna medición
   ausente, nula, vacía, no numérica o no finita. `null` nunca se convierte en 0. La humedad debe estar
   en 0–100 y la precipitación ser ≥ 0. La temperatura no tiene umbrales. **Duplicados**: entre las filas
   válidas se conserva la **primera aparición** de cada `ciudad + fecha_hora`, en el orden de
   extracción, y las siguientes se rechazan.
4. **Filtrado y selección**: válidos → filtros → ordenación → selección → carga. La paginación solo
   afecta a la vista. Cambiar los filtros no selecciona filas automáticamente. Solo se suben las filas
   seleccionadas que **siguen** cumpliendo los filtros, y se indica cuántas quedan fuera.
5. **Carga**: al pulsar “Subir N registros” se congela una copia del conjunto y su orden. Se envía al
   servidor en lotes de ≤ 500. El servidor vuelve a validar cada lote y hace un *upsert* por
   `(ciudad, fecha_hora)`. Después comprueba por lotes que las claves existen en destino. Si un lote
   falla, se pueden reintentar solo los fallidos. Supabase no distingue inserciones de actualizaciones,
   así que solo se muestra el total de filas afectadas.

Una tabla SQL no conserva el orden de inserción: para leer en un orden concreto hace falta `ORDER BY`.
La pestaña “Datos en Supabase” siempre lo indica.

## Seguridad

- Toda la lectura y escritura en la tabla pasa por los endpoints de servidor (`app/api/*`), que usan
  `SUPABASE_SECRET_KEY`. `lib/supabase/admin.ts` importa `server-only`, así que el build falla si algún
  componente de cliente lo importa.
- RLS está activado y no hay políticas: `anon` y `authenticated` no pueden leer ni escribir.
- El servidor limita el cuerpo a 256 KB y cada lote a 500 registros, y valida tipos, rangos, ciudades y
  claves repetidas.
- **El proyecto no tiene autenticación.** Los endpoints funcionan en desarrollo y responden 403 en
  producción. Antes de publicar la aplicación hay que añadir autenticación (por ejemplo Supabase Auth) y
  comprobarla en cada endpoint.

## Estructura

```
lib/etl/            lógica del pipeline (pura, compartida por navegador y servidor)
lib/supabase/       clientes de Supabase (navegador, servidor, admin)
app/api/            carga, verificación, lectura y estado
components/etl/     interfaz
supabase/migrations migración SQL
tests/              pruebas unitarias (fixtures en tests/fixtures) e integración
```
