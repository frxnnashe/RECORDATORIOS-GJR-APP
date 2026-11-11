# Reminders GJR

PWA privada para proyectos y tareas. Incluye tablero Kanban, bandeja de entrada, agenda, vencimientos, recordatorios Web Push y widget de pantalla de inicio con Scriptable.

## Ejecutar en Windows

1. Instalá Node.js 24 y ejecutá `npm ci`.
2. Copiá `.env.example` a `.env.local`. Completá `MONGODB_URI` con la URI de Atlas y `BETTER_AUTH_SECRET` con un secreto aleatorio. Para generarlo, usá `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.
3. Ejecutá `npm run dev` y abrí [localhost:3000](http://localhost:3000).

En Atlas, usá un clúster Free y un usuario de base de datos con rol `readWrite` para `reminders_gjr`. Agregá tu IP en **Network Access**. Al registrarte, la app crea las colecciones y los índices automáticamente. Compass permite verlos.

## Configurar en Vercel

- Importá el repositorio como proyecto Next.js y configurá Node.js 24. Agregá las variables del archivo de ejemplo en **Settings → Environment Variables**. En producción, `BETTER_AUTH_URL` debe ser el origen HTTPS exacto de la app.
- Atlas debe permitir el tráfico de salida del servidor. Con una IP de egreso fija, agregá esa IP a Atlas. Para Vercel Hobby con egreso dinámico, la opción directa es permitir cualquier origen IPv4 en la lista de Atlas. En ese caso usá un usuario exclusivo de la app, permisos limitados a la base y una contraseña fuerte nueva. La entrada de red es del proyecto completo de Atlas.
- Para inicio con Google, creá un cliente OAuth de tipo **Aplicación web** en Google Cloud y registrá el origen de la PWA y la URI de redirección `https://tu-dominio/api/auth/callback/google`. Para desarrollo, también podés registrar `http://localhost:3000` y `http://localhost:3000/api/auth/callback/google`. Guardá el ID y el secreto del cliente en las variables correspondientes.
- Para recuperación por correo, configurá Resend con un dominio remitente verificado y las variables `RESEND_API_KEY` y `AUTH_EMAIL_FROM`. El acceso por correo y contraseña funciona con MongoDB y Better Auth.

## Avisos programados

1. Generá las claves con `npx web-push generate-vapid-keys` y guardá el par VAPID como variables de entorno. Usá un correo de contacto en formato `mailto:` o una URL HTTPS pública para `VAPID_SUBJECT`.
2. Configurá `CRON_SECRET` con un secreto aleatorio en Production. `vercel.json` configura Vercel Schedules para consultar los avisos cada 15 minutos. Hobby aplica una ventana de ejecución de hasta 15 minutos por consulta. Si necesitás un intervalo menor, QStash admite un schedule POST cada dos minutos (`*/2 * * * *`) a `https://tu-dominio/api/reminders/dispatch` con cuerpo `{}` y las dos claves de firma configuradas.
3. En iPhone con iOS 16.4 o posterior, abrí la PWA desde Safari, agregala a la pantalla de inicio y abrila desde su ícono. En **Configuración → Notificaciones**, activá el permiso y enviá un aviso de prueba. Luego programá un aviso en una tarea y comprobalo con la PWA cerrada.

Los avisos pueden ser relativos al vencimiento, puntuales o recurrentes. En **Añadir aviso → Repetir…**, elegí el primer aviso, el intervalo en días, semanas o meses y una fecha de fin opcional. Las recurrencias conservan la hora local de la zona en la que se programaron. Si un mes tiene menos días, el aviso cae el último día de ese mes. Se reintentan durante las 24 horas posteriores a la hora programada. Un aviso por cada dispositivo conserva el mismo identificador al reintentar. Completar una tarea cancela sus avisos pendientes.

## Dictado y widget

- En **Cargar por voz**, tocá el micrófono del teclado del iPhone, dictá y elegí **Interpretar dictado**. Revisá el borrador y guardalo. Podés incluir título, descripción, vencimiento, proyecto, prioridad y varios avisos en la misma frase. La interpretación del texto se ejecuta en el navegador.
- En **Configuración → Widget de Scriptable**, descargá el script y reemplazá el contenido de tu script anterior. Conserva la vinculación guardada. En el widget seleccioná **Run Script** en **When Interacting** y tocá **Actualizar y ver** para consultar los datos al momento. iOS decide cuándo redibuja el widget. Usá el ícono de Reminders GJR para abrir la PWA instalada. Generar otra clave invalida la anterior.

Ejecutá `npm test`, `npm run lint` y `npm run build` para verificar cambios.
