-- Tabla destino del pipeline ETL Open-Meteo → Supabase.
create table if not exists public.mediciones_meteorologicas (
  id bigint generated always as identity primary key,
  ciudad text not null,
  fecha_hora timestamptz not null,
  temperatura_c double precision not null,
  humedad_pct double precision not null,
  precipitacion_mm double precision not null,
  importado_en timestamptz not null default now(),

  -- Clave natural: una medición por ciudad y hora. El upsert usa esta restricción.
  constraint mediciones_meteorologicas_ciudad_fecha_hora_key unique (ciudad, fecha_hora),

  constraint mediciones_meteorologicas_ciudad_no_vacia
    check (length(btrim(ciudad)) > 0),
  -- En PostgreSQL 'NaN' es mayor que cualquier número, así que estos límites
  -- también excluyen NaN e infinitos. No hay umbrales para la temperatura.
  constraint mediciones_meteorologicas_temperatura_finita
    check (temperatura_c > '-Infinity'::double precision and temperatura_c < 'Infinity'::double precision),
  constraint mediciones_meteorologicas_humedad_rango
    check (humedad_pct >= 0 and humedad_pct <= 100),
  constraint mediciones_meteorologicas_precipitacion_no_negativa
    check (precipitacion_mm >= 0 and precipitacion_mm < 'Infinity'::double precision)
);

comment on table public.mediciones_meteorologicas is
  'Mediciones horarias (UTC) de Open-Meteo cargadas por el pipeline ETL de la práctica.';
comment on column public.mediciones_meteorologicas.importado_en is
  'Momento de la primera inserción. Un upsert posterior actualiza las mediciones pero no esta columna.';

-- RLS activado y SIN políticas: anon y authenticated no pueden leer ni escribir.
-- Solo el servidor de la aplicación, con la clave secreta, accede a la tabla.
alter table public.mediciones_meteorologicas enable row level security;

revoke all on table public.mediciones_meteorologicas from anon, authenticated;
