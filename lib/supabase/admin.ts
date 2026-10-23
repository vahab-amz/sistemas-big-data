import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

/**
 * Cliente con la clave secreta (service role). Ignora RLS, así que SOLO puede
 * usarse en el servidor. `server-only` hace fallar el build si algún componente
 * de cliente lo importa por error.
 */
export function crearClienteAdmin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) return null
  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
