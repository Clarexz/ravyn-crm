# ravyn-crm — Plan de Implementación

> CRM multi-tenant para clínicas dentales. Capa de visualización y gestión sobre los flujos de n8n existentes.
> Stack: Next.js 14 · Supabase · Tailwind · shadcn/ui

---

## Decisiones de arquitectura

### Fuente de verdad: Supabase (no Google Sheets)

El principal cambio arquitectónico es mover la fuente de verdad de Google Sheets a Supabase. Las razones:

- El CRM necesita auth, RLS, relaciones y queries complejas — Sheets no escala para eso
- Ya tienen Supabase self-hosted corriendo para SOMA
- n8n ya sabe escribir a Supabase vía PostgREST (patrón establecido)
- Google Calendar puede quedar como vista de conveniencia, pero Supabase es el canonical store

**Transición de n8n:** agregar un nodo HTTP Request a Supabase (PostgREST) en cada workflow existente que hoy escribe a Sheets. No se reemplaza Sheets de inmediato — se escribe a ambos durante la transición, luego se depreca Sheets.

### Multi-tenancy: clinic_id en cada tabla + RLS

Cada clínica es un tenant. Supabase RLS garantiza que ningún usuario vea datos de otra clínica. La política es simple: `clinic_id = auth.jwt() -> clinic_id`.

### n8n ↔ CRM: bridge bidireccional

- **n8n → CRM:** n8n escribe directamente a Supabase (citas nuevas desde WhatsApp/web)
- **CRM → n8n:** cuando se crea una cita manual en el CRM, se llama un webhook de n8n para activar el flujo de recordatorios/seguimiento

---

## Schema de base de datos

```sql
-- Tenant principal
clinics (
  id uuid PK,
  name text NOT NULL,
  phone text,
  email text,
  subdomain text UNIQUE,       -- para futura URL: clinica.ravyn.app
  plan text DEFAULT 'basic',
  created_at timestamptz
)

-- Usuarios del CRM (staff de la clínica)
users (
  id uuid PK,                  -- vinculado a Supabase Auth
  clinic_id uuid FK → clinics,
  full_name text,
  role text CHECK IN ('admin','staff'),  -- admin: config + todo; staff: solo citas
  created_at timestamptz
)

-- Pacientes de la clínica
patients (
  id uuid PK,
  clinic_id uuid FK → clinics,
  full_name text NOT NULL,
  phone text,                  -- sin +, con prefijo MX, igual que en SOMA
  email text,
  notes text,                  -- notas internas de la clínica
  source text DEFAULT 'manual' CHECK IN ('whatsapp','web','manual'),
  created_at timestamptz
)

-- Citas
appointments (
  id uuid PK,
  clinic_id uuid FK → clinics,
  patient_id uuid FK → patients ON DELETE SET NULL,
  scheduled_at timestamptz NOT NULL,
  duration_minutes int DEFAULT 30,
  status text DEFAULT 'pending' CHECK IN ('pending','confirmed','cancelled','completed','no_show'),
  service text,                -- ej: "Limpieza", "Ortodoncia", "Extracción"
  notes text,
  source text DEFAULT 'manual' CHECK IN ('whatsapp','web','manual'),
  n8n_execution_id text,       -- para trazabilidad con el flujo de n8n
  created_at timestamptz,
  updated_at timestamptz
)

-- Audit log de cambios en citas
appointment_logs (
  id uuid PK,
  appointment_id uuid FK → appointments,
  changed_by uuid FK → users,
  old_status text,
  new_status text,
  note text,
  created_at timestamptz
)
```

**RLS policies (todas las tablas):**
```sql
-- Ejemplo para appointments
CREATE POLICY "clinic_isolation" ON appointments
  USING (clinic_id = (auth.jwt() ->> 'clinic_id')::uuid);
```

---

## Fases de implementación

---

### Fase 0 — Setup y repositorio
**Duración estimada: 1–2 días**

```
ravyn-crm/
├── app/
│   ├── (auth)/login/
│   ├── (dashboard)/
│   │   ├── layout.tsx          # sidebar + header
│   │   ├── page.tsx            # dashboard home
│   │   ├── appointments/
│   │   ├── patients/
│   │   └── settings/
├── components/
│   ├── ui/                     # shadcn components
│   └── crm/                    # componentes propios
├── lib/
│   ├── supabase/
│   │   ├── client.ts           # browser client
│   │   └── server.ts           # server client (SSR)
│   └── n8n/
│       └── webhooks.ts         # llamadas a n8n
└── middleware.ts               # auth + tenant guard
```

**Checklist Fase 0:**
- [ ] `npx create-next-app ravyn-crm --typescript --tailwind --app`
- [ ] Instalar: `@supabase/supabase-js`, `@supabase/ssr`, `shadcn/ui`
- [ ] Instalar Framer Motion para animaciones
- [ ] Instalar librería de animaciones (framer-motion@^11)
- [ ] Variables de entorno: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `N8N_WEBHOOK_SECRET`
- [ ] Crear schema en Supabase (tablas + RLS)
- [ ] Seed de clínica de prueba para desarrollo
- [ ] Repo en GitHub, deploy preview en Vercel

---

### Fase 1 — Auth y middleware de tenant
**Duración estimada: 2–3 días**

#### Flujo de autenticación
1. Login con email + password (Supabase Auth)
2. Al autenticarse, el JWT incluye `clinic_id` y `role` vía Custom Claims
3. `middleware.ts` intercepta todas las rutas `/dashboard/*` y valida sesión
4. Cada query al DB automáticamente está scoped al `clinic_id` del JWT (RLS)

#### Implementación de Custom Claims
```sql
-- Función que inyecta clinic_id y role al JWT de Supabase
CREATE OR REPLACE FUNCTION auth.custom_access_token_hook(event jsonb)
RETURNS jsonb AS $$
DECLARE
  u record;
BEGIN
  SELECT clinic_id, role INTO u FROM users WHERE id = (event->>'user_id')::uuid;
  RETURN jsonb_set(event, '{claims}', 
    event->'claims' || jsonb_build_object('clinic_id', u.clinic_id, 'role', u.role)
  );
END;
$$ LANGUAGE plpgsql;
```

#### Pantalla de Login
- Email + password (sin "sign up" público — las cuentas las crea Revyn Studio)
- Diseño alineado a la identidad de Ravyn: dark, tipografía fuerte, sin fluff

**Checklist Fase 1:**
- [ ] Supabase Auth configurado (email/password, sin magic link por ahora)
- [ ] Custom claims hook en Supabase
- [ ] `middleware.ts` con redirect a `/login` si no hay sesión
- [ ] Página `/login` funcional
- [ ] Logout
- [ ] Helper `createClient()` para server components y client components

---

### Fase 2 — Shell del dashboard y navegación
**Duración estimada: 2 días**

Layout base del CRM:

```
┌─────────────────────────────────────────────┐
│  sidebar (240px)    │  main content          │
│  ─────────────────  │  ─────────────────     │
│  Clínica XYZ        │  [header: título +     │
│  ─────────────────  │   user avatar]         │
│  📅 Dashboard       │                        │
│  🗓  Citas          │  [page content]        │
│  👥 Pacientes       │                        │
│  ⚙️  Configuración  │                        │
└─────────────────────────────────────────────┘
```

**Componentes del shell:**
- `<Sidebar>` — navegación principal, nombre de la clínica, avatar de usuario
- `<Header>` — título de la página activa, acciones contextuales (ej: "Nueva cita")
- `<PageWrapper>` — padding, max-width, estructura consistente

**Checklist Fase 2:**
- [ ] Layout con sidebar responsive (colapsa en mobile)
- [ ] Navegación activa por ruta
- [ ] Header dinámico por sección
- [ ] Dark mode desde el inicio (usando CSS variables)
- [ ] Loading skeletons base

---

### Fase 3 — Vista de citas (el núcleo del CRM)
**Duración estimada: 4–5 días**

Esta es la pantalla más importante. Dos sub-vistas:

#### 3A — Vista calendario
- Calendario mensual/semanal con citas como bloques de color por status
- Click en cita → panel lateral con detalle
- Drag to reschedule (nice-to-have, Fase 5)
- Librería recomendada: `react-big-calendar` o `@fullcalendar/react`

#### 3B — Vista tabla
- Tabla paginada con todas las citas
- Filtros: fecha, status, fuente (WhatsApp/web/manual)
- Búsqueda por nombre de paciente
- Columnas: Paciente, Fecha/Hora, Servicio, Status, Fuente, Acciones

#### Indicadores de status (color-coded)
```
pending    → amarillo   "Pendiente"
confirmed  → verde      "Confirmada"
cancelled  → rojo       "Cancelada"
completed  → gris       "Completada"
no_show    → naranja    "No se presentó"
```

**Checklist Fase 3:**
- [ ] Fetch de citas desde Supabase (server component + revalidación)
- [ ] Vista calendario funcional
- [ ] Vista tabla con filtros y búsqueda
- [ ] Toggle entre ambas vistas
- [ ] Panel de detalle de cita (slide-over)
- [ ] Actualizar status desde el panel (con optimistic update)
- [ ] Registrar cambio en `appointment_logs`

---

### Fase 4 — CRUD completo de citas y pacientes
**Duración estimada: 3–4 días**

#### Crear cita manual
Modal/página con:
- Buscar o crear paciente (autocomplete)
- Fecha + hora (date/time picker)
- Duración
- Servicio (dropdown configurable)
- Notas
- Al guardar → POST a Supabase + llamada al webhook de n8n (activar flujo de recordatorios)

#### Editar cita
- Mismos campos, pre-filled
- Campo extra: razón del cambio (queda en `appointment_logs`)

#### Cancelar cita
- Confirmación con modal
- Campo opcional: motivo de cancelación
- Actualiza status + log + llama webhook de n8n (para enviar notificación al paciente vía WhatsApp)

#### CRUD de pacientes
- Lista de pacientes con búsqueda
- Perfil del paciente: datos + historial de citas
- Crear/editar paciente
- Merge duplicados (si mismo teléfono, diferente registro)

**n8n webhook calls desde el CRM:**
```typescript
// lib/n8n/webhooks.ts
export async function triggerAppointmentCreated(appointmentId: string) {
  await fetch(process.env.N8N_WEBHOOK_APPOINTMENT_CREATED!, {
    method: 'POST',
    headers: { 'X-Webhook-Secret': process.env.N8N_WEBHOOK_SECRET! },
    body: JSON.stringify({ appointmentId, source: 'crm_manual' })
  })
}

export async function triggerAppointmentCancelled(appointmentId: string, reason?: string) {
  await fetch(process.env.N8N_WEBHOOK_APPOINTMENT_CANCELLED!, {
    method: 'POST',
    headers: { 'X-Webhook-Secret': process.env.N8N_WEBHOOK_SECRET! },
    body: JSON.stringify({ appointmentId, reason })
  })
}
```

**Checklist Fase 4:**
- [ ] Form de nueva cita (modal)
- [ ] Autocomplete de pacientes en el form
- [ ] Crear paciente inline desde el form de cita
- [ ] Editar cita
- [ ] Cancelar cita con confirmación
- [ ] Lista de pacientes con búsqueda
- [ ] Perfil de paciente con historial
- [ ] Crear/editar paciente
- [ ] Webhook calls a n8n en crear/cancelar

---

### Fase 5 — Dashboard de métricas
**Duración estimada: 2–3 días**

Vista home del CRM. KPIs principales:

```
┌──────────┬──────────┬──────────┬──────────┐
│ Citas hoy│ Esta sem │ Pendientes│ No shows │
│    12    │    47    │    8      │   3 (6%) │
└──────────┴──────────┴──────────┴──────────┘

[Gráfica: citas por día - últimas 4 semanas]

[Lista: próximas citas del día - top 5]
[Lista: citas sin confirmar - requieren acción]
```

**Queries SQL para métricas:**
```sql
-- Citas de hoy
SELECT count(*) FROM appointments 
WHERE clinic_id = $1 
AND scheduled_at::date = CURRENT_DATE 
AND status != 'cancelled';

-- Tasa de no-show (últimos 30 días)
SELECT 
  COUNT(*) FILTER (WHERE status = 'no_show') * 100.0 / 
  NULLIF(COUNT(*) FILTER (WHERE status IN ('completed','no_show')), 0) as no_show_rate
FROM appointments
WHERE clinic_id = $1 AND scheduled_at > NOW() - INTERVAL '30 days';
```

**Checklist Fase 5:**
- [ ] 4 KPI cards con datos reales
- [ ] Gráfica de citas por día (recharts o chart.js)
- [ ] Lista de próximas citas del día
- [ ] Lista de citas pendientes de confirmar
- [ ] Actualización en tiempo real (Supabase Realtime)

---

### Fase 6 — Configuración de la clínica
**Duración estimada: 1–2 días**

Solo visible para `role = 'admin'`:

- **Perfil de la clínica:** nombre, teléfono, email, logo
- **Gestión de staff:** invitar usuarios, cambiar roles, desactivar cuentas
- **Servicios:** lista editable de servicios ofrecidos (popula el dropdown en citas)
- **Horario de atención:** días y horas disponibles (para el selector de fecha en citas)

**Checklist Fase 6:**
- [ ] Página de settings con tabs
- [ ] Editar perfil de clínica
- [ ] Invite a staff (Supabase Auth invite)
- [ ] CRUD de servicios
- [ ] Definición de horario

---

### Fase 7 — Migración y sync con n8n
**Duración estimada: 2–3 días (en paralelo o al final)**

**Paso 1: Migrar datos históricos de Sheets a Supabase**
- Script de migración: leer Sheets via Google Sheets API → insertar en Supabase
- Mapeo: columnas del Sheet → campos de `appointments` y `patients`
- Ejecutar en dry-run primero, validar conteos

**Paso 2: Actualizar flujos de n8n**
Para cada workflow que hoy escribe a Sheets, agregar nodo PostgREST paralelo:
```
[Nodo existente: Google Sheets Append]
        ↓
[Nuevo nodo: HTTP Request → Supabase PostgREST]
POST /rest/v1/appointments
Authorization: Bearer {service_role_key}
{
  "clinic_id": "...",
  "patient_id": "...",
  "scheduled_at": "...",
  "source": "whatsapp",
  "n8n_execution_id": "{{ $execution.id }}"
}
```

**Paso 3: Webhook de entrada (n8n llama al CRM)**

Alternativa más limpia al paso 2: crear un endpoint API en el CRM:

```
POST /api/webhooks/n8n/appointment-created
Authorization: Bearer {webhook_secret}
Body: { clinic_id, patient_phone, scheduled_at, source, notes }
```

El CRM recibe, crea/encuentra el paciente, crea la cita, responde. n8n no necesita saber nada del schema de Supabase.

> **Recomendación:** usar el endpoint del CRM. Es más desacoplado — si el schema de Supabase cambia, solo tocas el CRM, no los workflows de n8n.

**Checklist Fase 7:**
- [ ] Script de migración de Sheets → Supabase
- [ ] Endpoint `POST /api/webhooks/n8n/appointment-created`
- [ ] Endpoint `POST /api/webhooks/n8n/appointment-updated`
- [ ] Validar con la clínica piloto: datos correctos en CRM
- [ ] Actualizar workflows de n8n para apuntar al webhook del CRM

---

## Roadmap consolidado

| Fase | Contenido | Días est. | Prioridad |
|------|-----------|-----------|-----------|
| 0 | Setup, repo, schema | 1–2 | 🔴 Crítico |
| 1 | Auth + middleware tenant | 2–3 | 🔴 Crítico |
| 2 | Shell del dashboard | 2 | 🔴 Crítico |
| 3 | Vista de citas (calendario + tabla) | 4–5 | 🔴 Crítico |
| 4 | CRUD citas + pacientes | 3–4 | 🔴 Crítico |
| 5 | Dashboard de métricas | 2–3 | 🟡 Importante |
| 6 | Settings de clínica | 1–2 | 🟡 Importante |
| 7 | Migración + sync n8n | 2–3 | 🟡 Importante |
| — | **Total estimado** | **17–24 días** | — |

> Las fases 0–4 son el MVP funcional. Las fases 5–7 completan el producto.

---

## Stack y dependencias

### Animaciones y UX
Para animaciones y transiciones se usa **Framer Motion** como librería principal. Aplica para:
- Fade-in de KPI cards al cargar el dashboard
- Slide-in del panel de detalle de cita
- Transiciones de página en el dashboard (layout animations)
- Micro-interacciones en el sidebar (hover states, active state)

La guía de uso es: animaciones ligeras, propósito funcional, nunca decorativas sin motivo. Duration: 150–300ms. Easing: ease-out para entradas, ease-in para salidas.

```json
{
  "dependencies": {
    "next": "14.x",
    "@supabase/supabase-js": "^2",
    "@supabase/ssr": "^0.x",
    "tailwindcss": "^3",
    "shadcn/ui": "latest",
    "@fullcalendar/react": "^6",
    "@fullcalendar/daygrid": "^6",
    "@fullcalendar/timegrid": "^6",
    "@fullcalendar/interaction": "^6",
    "recharts": "^2",
    "react-hook-form": "^7",
    "@hookform/resolvers": "^3",
    "zod": "^3",
    "date-fns": "^3",
    "framer-motion": "^11"
  }
}
```

---

## Consideraciones de seguridad (multi-tenant)

- **RLS en todas las tablas** — nunca confiar solo en el código, que Supabase lo enforce
- **Webhook secret** para las llamadas n8n ↔ CRM — header `X-Webhook-Secret`
- **Service role key** solo en server-side (API routes, server components) — nunca en el cliente
- **Role check en API routes** — verificar que el JWT incluye `clinic_id` correcto antes de mutaciones
- Los webhooks de n8n que recibe el CRM deben validar el secret antes de escribir al DB
- **Service role key en .env.local** — nunca commitear el `.env.local` (ya está en `.gitignore` de Next.js)

---

## Preguntas abiertas (definir antes de Fase 4)

1. **¿Cómo se crean las cuentas de clínicas?** ¿Revyn Studio las crea manualmente vía Supabase Dashboard, o hay un panel admin interno?
2. **¿Cuántos servicios/tipos de cita maneja una clínica típica?** (para diseñar el dropdown)
3. **¿El CRM necesita multi-idioma?** (español solamente es el supuesto actual)
4. **Dominio final:** ¿`crm.ravynstudio.mx` o algo separado como `ravyncrm.mx`?
