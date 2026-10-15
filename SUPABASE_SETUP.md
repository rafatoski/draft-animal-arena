# Activar el modo en línea (Supabase)

Todo el código ya está en el repo. Falta ejecutarlo contra **tu** proyecto `floounhntoduncbyctky`.

## 1. Iniciar sesión con la cuenta dueña del proyecto
```bash
supabase logout            # si estaba abierta otra cuenta
supabase login             # abre el navegador: entra con la cuenta que creó floounhntoduncbyctky
supabase projects list     # debe aparecer floounhntoduncbyctky
```

## 2. Base de datos y funciones
```bash
supabase link --project-ref floounhntoduncbyctky     # pide la contraseña de la base de datos
supabase db push                                     # aplica supabase/migrations/*.sql
supabase functions deploy start-match
supabase functions deploy sheets-sync --no-verify-jwt
```

## 3. Panel de Supabase (Authentication)
- **Sign In / Providers → Anonymous sign-ins**: ON (Play as Guest).
- **Sign In / Providers → Google**: ON. Client ID y Secret de una credencial OAuth de Google Cloud
  (tipo "Web"). En Google Cloud, *Authorized redirect URI*: `https://floounhntoduncbyctky.supabase.co/auth/v1/callback`.
- **Sign In / Providers → Allow manual linking**: ON (vincular invitado → Google sin perder progreso).
- **URL Configuration**: Site URL `https://draft-animal-arena.vercel.app`; Redirect URLs añade
  `https://draft-animal-arena.vercel.app` y `http://localhost:5173`.
- Recomendado: activar Captcha o límite de tasa para registros anónimos.

## 4. Vercel
Variables en Production **y** Preview, luego *Redeploy* (Vite las incrusta al compilar):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`.

## 5. Google Sheets (opcional)
1. Google Cloud → crea una *Service Account*, genera una clave JSON y habilita la **Google Sheets API**.
2. Crea una hoja y compártela (Editor) con el correo de la cuenta de servicio.
3. ```bash
   supabase secrets set GOOGLE_SHEET_ID=<id de la hoja> SHEETS_SYNC_SECRET=<texto largo al azar>
   supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON="$(cat clave.json)"
   ```
4. Programa la llamada (cada 15 min) con pg_cron + pg_net, o un cron externo:
   `curl -X POST https://floounhntoduncbyctky.supabase.co/functions/v1/sheets-sync -H "x-sync-secret: <el mismo texto>"`

## 6. Comprobar
- `npm run dev`, abre el juego, toca la moneda → Cuenta → *Play as Guest*.
- En dos navegadores distintos: uno *Crear sala*, el otro *Unirse con código*; elijan equipo y *Listo*.

Al cambiar reglas en `src/simulation` o `src/game/{config,fighters,series,onlineSim}.ts` ejecuta `npm run sync:shared`
(los tests fallan si la copia del servidor quedó vieja).

## Ranking contra la máquina

Las peleas iniciadas con **Jugar**, con una cuenta de Google y conexión al servidor,
registran victorias, derrotas y partidas totales en el mismo ranking que el multijugador.
Práctica sigue excluida. Las partidas locales de invitados no tienen cuenta persistente.
Los resultados anteriores contra la máquina no se pueden recuperar: no se guardaban.

Desplegar primero la migración y luego la función, antes del frontend:

```sh
supabase db push
supabase functions deploy practice-match --project-ref floounhntoduncbyctky
```

La sesión conserva el modo y los rivales elegidos por el servidor. `cpu_matches` guarda
un solo resultado por sesión; reintentar el cierre no duplica las estadísticas.
