# Prescriptions API

API REST para un sistema de prescripciones médicas con 3 roles (Admin, Médico, Paciente). Construida como solución a una prueba técnica full‑stack.

- **Repositorio frontend:** [prescriptions-web](https://github.com/GabrielGarciaRodri/prescriptions-web)
- **API en producción:** https://prescriptions-api-production-2da6.up.railway.app
- **Frontend en producción:** https://prescriptions-web.vercel.app

## Tabla de contenido

1. [Stack tecnológico](#stack-tecnológico)
2. [Cuentas de prueba](#cuentas-de-prueba)
3. [Funcionalidad implementada](#funcionalidad-implementada)
4. [Setup local](#setup-local)
5. [Variables de entorno](#variables-de-entorno)
6. [Scripts disponibles](#scripts-disponibles)
7. [Endpoints](#endpoints)
8. [Modelo de datos](#modelo-de-datos)
9. [Autenticación y autorización](#autenticación-y-autorización)
10. [Testing](#testing)
11. [Despliegue](#despliegue)
12. [Decisiones técnicas](#decisiones-técnicas)

## Stack tecnológico

- **Runtime:** Node.js 20 LTS
- **Framework:** NestJS 11
- **ORM:** Prisma 6
- **Base de datos:** PostgreSQL 16
- **Autenticación:** JWT (access + refresh con rotación y detección de reuso)
- **Validación:** class-validator + class-transformer
- **Generación de PDF:** pdfkit
- **Testing:** Jest
- **Seguridad:** Helmet, CORS por origen, rate limiting global, bcrypt para passwords

## Cuentas de prueba

Cargadas vía `prisma db seed`. Disponibles tanto en local como en producción.

| Rol     | Email             | Contraseña  |
|---------|-------------------|-------------|
| Admin   | admin@test.com    | admin123    |
| Médico  | dr@test.com       | dr123       |
| Médico  | dr2@test.com      | dr123       |
| Paciente| patient@test.com  | patient123  |
| Paciente| patient2@test.com | patient123  |

El seed también crea 11 prescripciones con fechas escalonadas en los últimos 30 días, mezclando estados `pending` y `consumed` para que el dashboard del admin tenga datos significativos sin intervención manual.

## Funcionalidad implementada

### Por rol

**Admin**
- Visualiza métricas: totales (médicos, pacientes, prescripciones), distribución por estado, serie por día (últimos 30 días por defecto), top médicos por volumen.
- Filtrado por rango de fechas.

**Médico**
- Crea prescripciones con ítems digitados manualmente (sin catálogo de productos).
- Lista y filtra sus propias prescripciones por estado y fecha.
- Ve detalle de cada prescripción.
- Busca pacientes por email para asociarlos al crear una receta.

**Paciente**
- Lista y filtra sus propias prescripciones por estado.
- Marca prescripciones pendientes como consumidas (validación contra doble consumo).
- Descarga PDF de cualquiera de sus prescripciones.

### Transversal

- Autenticación JWT con refresh token rotativo y detección de reuso.
- RBAC con guards globales y decoradores `@Roles`.
- Paginación, filtros y ordenamiento en todos los listados.
- Generación de PDF profesional desde backend.
- Formato de error consistente (`{ message, code, details?, path, timestamp }`).
- Rate limiting (100 req/min por IP).
- Validación estricta de DTOs con rechazo de campos no declarados.

## Setup local

### Requisitos

- Node.js 20.19+ (definido en `.nvmrc`).
- PostgreSQL 16 (recomendado vía Docker).
- npm 10+.

### Instalación

```bash
# 1. Clonar
git clone https://github.com/GabrielGarciaRodri/prescriptions-api.git
cd prescriptions-api

# 2. Instalar dependencias
npm install

# 3. Levantar Postgres con Docker (opcional, si no tienes uno local)
docker run --name prescriptions-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=prescriptions \
  -p 5432:5432 -d postgres:16

# 4. Configurar variables de entorno
cp .env.example .env
# Editar .env si tu Postgres no es el del paso 3

# 5. Aplicar migraciones
npx prisma migrate dev

# 6. Cargar datos de prueba
npx prisma db seed

# 7. Levantar el servidor en modo desarrollo
npm run start:dev
```

El servidor queda escuchando en `http://localhost:3000/api`.

## Variables de entorno

El repositorio incluye un `.env.example` con la configuración por defecto compatible con el Docker del paso 3 del setup:

```env
# Base de datos
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/prescriptions?schema=public"

# JWT — en producción, generar con: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_ACCESS_SECRET="cambiar-en-produccion-min-32-chars"
JWT_REFRESH_SECRET="cambiar-en-produccion-min-32-chars-distinto"
JWT_ACCESS_TTL="900"       # 15 minutos (en segundos)
JWT_REFRESH_TTL="604800"   # 7 días (en segundos)

# CORS: dominios permitidos separados por coma, o "*" para permitir todos
APP_ORIGIN="http://localhost:3001"

# Puerto local (en Railway/Render lo inyecta la plataforma como variable PORT)
PORT=3000

NODE_ENV=development
```

## Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run start:dev` | Levanta el servidor con watch mode. |
| `npm run build` | Compila TypeScript a `dist/`. |
| `npm run start:prod` | Ejecuta el build compilado. |
| `npm test` | Corre los tests unitarios. |
| `npm run test:cov` | Corre tests con reporte de coverage en `coverage/`. |
| `npx prisma migrate dev` | Aplica migraciones en desarrollo. |
| `npx prisma migrate deploy` | Aplica migraciones en producción (idempotente). |
| `npx prisma db seed` | Carga las cuentas y prescripciones de prueba. |
| `npx prisma studio` | Abre UI web para inspeccionar la DB. |

## Endpoints

Todos los endpoints están bajo el prefijo `/api`. Las rutas marcadas como protegidas requieren `Authorization: Bearer <accessToken>`.

### Auth (`/api/auth`)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/auth/login` | Público | Login con email/password. Devuelve `{ accessToken, refreshToken, user }`. |
| POST | `/auth/refresh` | Público | Rota el refresh token. Devuelve `{ accessToken, refreshToken }`. |
| POST | `/auth/logout` | Auth | Revoca el refresh token enviado. |
| GET  | `/auth/profile` | Auth | Devuelve el perfil del usuario autenticado. |

### Prescripciones

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/prescriptions` | Médico | Crea una prescripción para un paciente. |
| GET  | `/prescriptions` | Médico / Admin | Lista (médico: solo las suyas; admin: todas). |
| GET  | `/prescriptions/:id` | Cualquier rol | Detalle (con validación de ownership). |
| GET  | `/me/prescriptions` | Paciente | Lista las del paciente autenticado. |
| PUT  | `/prescriptions/:id/consume` | Paciente | Marca como consumida (solo dueño). |
| GET  | `/prescriptions/:id/pdf` | Doctor autor / Paciente dueño / Admin | Descarga PDF. |

### Pacientes

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/patients/search?email=` | Médico / Admin | Busca pacientes por email (mín. 2 chars, hasta 10 resultados). |

### Admin

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/admin/metrics?from=&to=` | Admin | Métricas agregadas con filtro de fechas opcional. |

### Filtros y paginación

Los listados aceptan los siguientes query params:

- `status`: `pending` o `consumed`
- `from`, `to`: fechas ISO (`YYYY-MM-DD`)
- `page`: número de página (default 1)
- `limit`: items por página (default 10, máximo 100)
- `order`: `asc` o `desc` (default `desc`)
- `mine`: para médico, `true` fuerza filtrar solo las suyas (ya es el comportamiento por defecto)
- `doctorId`, `patientId`: solo aplicables cuando el solicitante es admin

Respuesta paginada:

```json
{
  "data": [ ... ],
  "meta": { "page": 1, "limit": 10, "total": 42, "totalPages": 5 }
}
```

### Formato de error

Todas las respuestas de error siguen este shape (estandarizado por el filtro global de excepciones):

```json
{
  "message": "Descripción humana del error",
  "code": "UNAUTHORIZED",
  "details": "...opcional, lista de errores de validación...",
  "path": "/api/auth/login",
  "timestamp": "2026-05-14T21:15:42.000Z"
}
```

Códigos posibles: `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `TOO_MANY_REQUESTS`, `DUPLICATE_RESOURCE`, `INTERNAL_ERROR`.

## Modelo de datos

```
User (1) ── (0..1) Doctor ── (1..n) Prescription ── (1..n) PrescriptionItem
   │                                       │
   │              Patient (1..n) ──────────┘
   └── (1..n) RefreshToken
```

Entidades clave:

- **User**: `id`, `email`, `password` (bcrypt), `name`, `role` (enum `admin|doctor|patient`).
- **Doctor**: perfil 1‑a‑1 con `User`, con `specialty` y `license` opcionales.
- **Patient**: perfil 1‑a‑1 con `User`, con `birthDate` y `phone` opcionales.
- **Prescription**: `code` único (formato `RX-XXXXXXXX`), `status` (enum `pending|consumed`), `notes`, `consumedAt`, FK a `Doctor` (autor) y `Patient`.
- **PrescriptionItem**: `name`, `dosage`, `quantity`, `instructions` (todos digitados manualmente).
- **RefreshToken**: `tokenHash` (SHA‑256), `expiresAt`, `revokedAt`, `replacedById` (cadena de rotación), `userAgent`, `ip`.

Índices compuestos relevantes:

- `Prescription[status, createdAt]` para listados del admin.
- `Prescription[patientId, status]` para bandeja del paciente.
- `Prescription[authorId, createdAt]` para listado del médico.
- `Prescription[createdAt]` para métrica `byDay`.
- `RefreshToken[tokenHash]` y `RefreshToken[userId]` para refresh y revocación masiva.

## Autenticación y autorización

### Flujo de tokens

1. **Login**: el cliente envía email/password. El servidor valida contra el hash bcrypt y emite un par `accessToken` (JWT 15 min) + `refreshToken` (string aleatorio de 96 chars hex).
2. **Request autenticado**: el cliente manda `Authorization: Bearer <accessToken>`. La `JwtStrategy` valida la firma, busca el usuario en DB y popula `req.user` con `userId`, `email`, `role`, `doctorId`, `patientId`.
3. **Refresh**: el cliente envía el refresh token al endpoint `/auth/refresh`. Si es válido y no está revocado, se revoca, se emite un par nuevo y se encadena `replacedById` para auditoría.
4. **Detección de reuso**: si llega un refresh ya revocado, se asume compromiso y se revocan **todos** los refresh tokens activos del usuario.
5. **Logout**: revoca el refresh token del cliente.

### Almacenamiento de refresh tokens

Los refresh tokens **nunca** se guardan en claro. Se almacena su hash SHA‑256, que permite lookup indexado en O(1) sin revelar el token original.

### RBAC

- Decorador `@Roles(Role.admin, Role.doctor, ...)` marca los roles permitidos por endpoint.
- Decorador `@Public()` exime un endpoint de la auth global (login, refresh).
- Guards globales en orden: `ThrottlerGuard` → `JwtAuthGuard` → `RolesGuard`.
- Validaciones de ownership (doctor solo ve las suyas, paciente solo las suyas) ocurren a nivel de servicio con un método privado `assertCanAccess` centralizado.

## Testing

### Alcance entregado

- **Unitarios:** `prescriptions.service.spec.ts` cubre la lógica de `consume()` con 5 casos:
  - Rechazo si el usuario no es paciente.
  - 404 si la prescripción no existe.
  - Rechazo si la prescripción no pertenece al paciente.
  - 409 si ya fue consumida.
  - Camino feliz: marca como consumida con `consumedAt`.

```bash
npm test                          # corre toda la suite
npm test -- prescriptions.service # solo el spec del servicio crítico
npm run test:cov                  # con reporte de cobertura en ./coverage
```

Los mocks de `PrismaService` y `PrescriptionPdfService` se inyectan vía `Test.createTestingModule`.

**Alcance honesto:** se prioriza el flujo crítico de negocio (consumo de prescripción) por restricción de tiempo. El patrón de testing es directamente reproducible para el resto de servicios (`AuthService`, `AdminService`, `PrescriptionsService.create/list`) siguiendo la misma estructura de mocks.

## Despliegue

### Producción actual

| Componente | Plataforma | URL |
|---|---|---|
| API | Railway | https://prescriptions-api-production-2da6.up.railway.app |
| PostgreSQL | Railway | Privado (acceso interno entre servicios) |
| Frontend | Vercel | https://prescriptions-web.vercel.app |

### Configuración del backend en Railway

- Builder: **Railpack v0.23** (detecta Node 20 desde `.nvmrc`).
- Build: `npm ci` → `postinstall: prisma generate` → `npm run build`.
- Start: `npm run db:migrate:deploy && node dist/main.js`.
- `DATABASE_URL` cableado vía referencia interna `${{Postgres.DATABASE_URL}}`.
- `APP_ORIGIN` configurado con los orígenes válidos separados por coma.
- Listener en `0.0.0.0:$PORT` (la variable `PORT` la inyecta Railway automáticamente) con `trust proxy` activo para obtener IP real del cliente detrás del proxy de la plataforma.

Archivos relevantes en la raíz:

- `.nvmrc` (fija Node 20).
- `railway.json` (define el `startCommand`).
- `prisma.config.ts` (carga explícita de dotenv para Prisma 6+).

### Pasos para replicar el despliegue

1. Crear proyecto en Railway desde el repo de GitHub.
2. Añadir servicio PostgreSQL al mismo proyecto.
3. Configurar variables de entorno en el servicio API:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (generados con `randomBytes(48).toString('hex')`)
   - `JWT_ACCESS_TTL=900`, `JWT_REFRESH_TTL=604800`
   - `APP_ORIGIN=<dominio del frontend, sin barra final>`
   - `NODE_ENV=production`
4. Push a `main` → Railway detecta el cambio y despliega automáticamente.
5. Generar dominio público en Settings → Networking.
6. Correr el seed una sola vez:

```bash
railway link
DATABASE_URL="<URL pública del Postgres>" npx prisma db seed
```

## Decisiones técnicas

### Por qué Bearer en lugar de cookies HTTP‑Only

El enunciado permite ambos esquemas. Se optó por Bearer porque:

- Simplifica CORS cross‑domain entre Vercel (frontend) y Railway (API), evitando configuración de `SameSite=None; Secure` y dominios padre comunes.
- El frontend es 100% CSR con un interceptor de axios que gestiona la rotación del refresh token de forma centralizada.

Trade‑off conocido: el token vive en `localStorage` (vía `zustand/persist`), lo que lo expone a XSS. En un escenario de producción real con SSR y datos sensibles, la opción correcta sería cookies HTTP‑Only + `SameSite=Lax` + `Secure`, sirviendo front y API desde subdominios del mismo dominio raíz. Para el alcance de esta prueba (MVP, dominios distintos, sin SSR de datos privados) Bearer ofrece mejor relación simplicidad/seguridad.

### Por qué refresh tokens rotativos con detección de reuso

El enunciado pedía refresh tokens y marcaba la rotación como "recomendada". Se implementó la rotación completa con detección de reuso porque es el patrón profesional: cuando llega un refresh ya revocado se revocan todos los tokens activos del usuario asumiendo compromiso. Esto añade ~30 líneas de código y una tabla, a cambio de protección real contra robo de tokens. El interceptor del frontend usa una cola para serializar refreshes concurrentes y evitar gatillar esa detección por accidente.

### Por qué SHA‑256 para el hash del refresh token

Bcrypt es ideal para passwords humanos (baja entropía, necesitan salting y cost factor). Los refresh tokens son random de 96 chars hex generados con `crypto.randomBytes(48)`: ya tienen alta entropía y un hash determinístico es suficiente. SHA‑256 además permite lookup indexado en DB, que con bcrypt sería inviable (no se puede indexar un hash con salt aleatorio).

### Por qué lookup del user en cada request

`JwtStrategy.validate()` hace una query a DB para obtener el user con sus perfiles. Esto añade ~10ms por request pero permite (a) revocar usuarios al instante, (b) tener `doctorId/patientId` disponibles en `req.user` sin queries adicionales en los services. Para una prueba técnica es la decisión correcta; en producción real se cachearía con Redis con TTL corto.

### Por qué pdfkit y no Puppeteer

Puppeteer requiere el binario de Chromium dentro del contenedor, lo que infla el tamaño de la imagen y suele dar problemas en plataformas managed con cold starts. pdfkit es 100% Node, sin dependencias nativas pesadas, y permite control imperativo del layout, suficiente para el documento que pide el enunciado.

### Por qué Prisma 6 y no Prisma 7

Al iniciar el desarrollo, npm instaló Prisma 7 por defecto. Prisma 7 introdujo cambios en el generador del cliente que rompían el build en entornos managed (el cliente quedaba parcialmente generado en `node_modules/.prisma/client`). Se bajó a Prisma 6 (estable, misma API que la 5) para garantizar reproducibilidad del build en Railway.

### Por qué generar el código `RX-XXXXXXXX` aparte del cuid

Las prescripciones tienen tanto `id` (cuid interno) como `code` (legible). El `code` es lo que aparece en el PDF, en la UI y en futuras URLs de QR. Un cuid de 25 chars no es práctico para imprimir o dictar. Se genera con `randomBytes(4)` en hex upper (formato `RX-AB12CD34`) con reintento ante colisión P2002, garantizando unicidad sin secuencias en DB.

### Por qué guards globales

`JwtAuthGuard` y `RolesGuard` están registrados como guards globales en `APP_GUARD`. Esto invierte el default: **toda ruta requiere auth y rol** por defecto, y se opta out con `@Public()`. Es defensa en profundidad: si alguien crea un endpoint nuevo y se olvida de protegerlo, queda protegido automáticamente.

### Por qué `forbidNonWhitelisted` en el ValidationPipe

El pipe global rechaza payloads con campos no declarados en el DTO. Esto previene ataques de mass assignment (intentar setear campos que no deberían ser editables desde el cliente, como `authorId` al crear una prescripción).

### Documentación de endpoints

Se documentan vía este README + los tipos TypeScript compartidos con el frontend (`src/lib/types.ts` en el repo del front). Se evaluó añadir Swagger pero se priorizó cerrar testing y deploy; añadirlo es un cambio aislado (`@nestjs/swagger` + decoradores en DTOs y controllers).