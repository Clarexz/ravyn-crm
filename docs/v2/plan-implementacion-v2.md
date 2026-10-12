# Ravyn CRM v2 — Plan de Implementacion

Plataforma de agentes de IA para la gestion de negocios multi-vertical.
Evolucion arquitectonica desde el CRM vertical dental hacia una plataforma multi-agente con gobernanza, herramientas y adaptabilidad por industria.

---

## 1. Vision General de la Version 2

Ravyn CRM v2 transforma el sistema desde un CRM pasivo de registro dental hacia un entorno operativo activo para pequenas y medianas empresas (PyMEs). En este entorno, un equipo coordinado de agentes de inteligencia artificial ejecuta tareas operativas reales dentro de la base de datos bajo la supervision y aprobacion de usuarios humanos.

### Principios Arquitectonicos de la v2

1. **Multi-tenancy agnostico a la industria:** El tenant base pasa de clinica a organizacion o negocio, con configuracion modular segun su giro comercial.
2. **Modelo de datos universal de CRM:** Estandarizacion de contactos, oportunidades de venta, actividades, agenda y catalogo de productos o servicios.
3. **Ejecucion orientada a herramientas (Tool Calling):** Los agentes no son simples interfaces de conversacion; son entidades con permisos definidos que ejecutan funciones validadas mediante schemas estructurados.
4. **Supervision humana (Human-in-the-Loop):** Toda accion catalogada como sensible o irreversible entra en cola de aprobacion humana antes de impactar el estado del negocio.
5. **Trazabilidad y auditoria integral:** Registro inmutable de cada decision, herramienta ejecutada, usuario revisor y resultado de los agentes.

---

## 2. Mapa de Fases de Implementacion

| Fase | Enfoque Principal | Entregable Clave | Criterio de Testabilidad |
|---|---|---|---|
| **Fase 0** | Schema universal y migracion de datos | Tablas de organizaciones, contactos, leads, actividades y logs de agentes | Migraciones SQL ejecutadas, queries de compatibilidad validados |
| **Fase 1** | Capa de Herramientas y Motor de Agentes | Catalogo de Tools con validacion Zod y Router Orquestador | Pruebas unitarias de ejecucion de tools e invocacion con mock context |
| **Fase 2** | Sistema de Gobernanza y Human-in-the-Loop | Maquina de estados de acciones y endpoints de aprobacion | Pruebas de integracion: acciones automaticas vs en espera de aprobacion |
| **Fase 3** | UI de Supervision y Bandeja de Aprobaciones | Bandeja de entrada de agentes y Centro de Control en Dashboard | Flujo visual e interactivo de aprobacion/rechazo con actualizacion de estado |
| **Fase 4** | Adaptabilidad Modular por Industria | Selector de vertical y adaptacion dinamica de modulos y prompts | Cambio de perfil de negocio activa/desactiva vistas y restringe tools |
| **Fase 5** | Pipeline de Ventas y Agente Analista | Vista Kanban de oportunidades y generador de reportes ejecutivos | Creacion de oportunidades por agente y generacion de briefing analitico |
| **Fase 6** | Pruebas de Integracion End-to-End | Bateria de pruebas de flujo completo en tres industrias | Verificacion de extremo a extremo sin intervencion manual no autorizada |

---

## Fase 0: Schema Universal y Abstraccion Multi-Vertical

### Objetivo
Generalizar el modelo de base de datos de PostgreSQL en Supabase para soportar multiples industrias, pipelines comerciales y el registro de acciones de agentes de IA, preservando la compatibilidad con los datos existentes de clinicas dentales.

### Cambios en Base de Datos

```sql
-- 1. Tenants universales
CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  industry text NOT NULL CHECK (industry IN ('health', 'restaurant', 'real_estate', 'professional_services', 'retail', 'general')),
  phone text,
  email text,
  subdomain text UNIQUE,
  settings jsonb DEFAULT '{}'::jsonb, -- modulos activos, horarios, politicas
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 2. Contactos universales (reemplaza o abstrae patients)
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  company_name text,
  custom_fields jsonb DEFAULT '{}'::jsonb,
  source text DEFAULT 'manual' CHECK (source IN ('whatsapp', 'web', 'manual', 'agent_receptionist', 'import')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Pipeline comercial (Leads y Oportunidades)
CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  title text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('lead', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost')),
  value numeric(12,2) DEFAULT 0,
  currency text DEFAULT 'MXN',
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  probability int DEFAULT 0,
  closed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 4. Actividades y tareas (historial operativo)
CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES opportunities(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('call', 'message', 'meeting', 'task', 'note', 'status_change')),
  title text NOT NULL,
  description text,
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled')),
  performed_by_type text NOT NULL CHECK (performed_by_type IN ('human', 'agent')),
  performed_by_id text NOT NULL, -- user_id o agent_identifier
  due_date timestamptz,
  created_at timestamptz DEFAULT now()
);

-- 5. Registro de acciones y gobernanza de agentes
CREATE TABLE agent_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  agent_name text NOT NULL CHECK (agent_name IN ('orchestrator', 'receptionist', 'sales', 'follow_up', 'booking', 'analyst')),
  action_type text NOT NULL, -- ej: create_booking, apply_discount, update_opportunity
  payload jsonb NOT NULL,
  requires_approval boolean DEFAULT false,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'failed')),
  proposed_at timestamptz DEFAULT now(),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_notes text,
  execution_result jsonb,
  error_message text
);
```

### Criterios de Aceptacion y Medicion
- El script de migracion crea las nuevas tablas con RLS e indices por `organization_id`.
- Se genera una vista o migracion hacia atras que mapea `clinics` a `organizations` y `patients` a `contacts` sin perdida de integridad referencial.
- `types/database.ts` incluye las nuevas interfaces tipadas en TypeScript.

### Pruebas de Verificacion
- **Test DB-01:** Insertar y consultar un registro en `organizations` con industry `restaurant` y validar restricciones de esquema.
- **Test DB-02:** Verificar aislamiento de datos por `organization_id` mediante consultas directas con filtros de tenant.
- **Test DB-03:** Validar que `agent_actions` rechace inserciones de estados invalidos via constraint `CHECK`.

---

## Fase 1: Arquitectura del Motor Multi-Agente y Catalogo de Herramientas

### Objetivo
Construir el backend de ejecucion de agentes con patron Supervisor/Especialistas, donde cada agente opera exclusivamente ejecutando herramientas validadas contra la base de datos de la organizacion.

### Entregables
1. **Definicion de herramientas del sistema (`lib/agents/tools/`):**
   - `contact_tools.ts`: `search_contact`, `create_contact`, `update_contact_notes`.
   - `sales_tools.ts`: `create_opportunity`, `update_stage`, `calculate_quote`.
   - `booking_tools.ts`: `check_availability`, `create_booking`, `reschedule_booking`.
   - `activity_tools.ts`: `create_task`, `log_message`, `set_reminder`.
2. **Definicion de interfaces de agentes:**
   - **Agente Recepcionista:** Clasificacion de entrada, consulta/alta de contactos.
   - **Agente de Ventas:** Calificacion de leads con formula o rubrica del negocio, cotizacion.
   - **Agente de Agenda:** Validacion de slots de tiempo y creacion de citas/reservas.
   - **Agente de Seguimiento:** Deteccion de prospectos o cotizaciones sin actividad.
   - **Agente Analista:** Agregacion de metricas de la organizacion.
3. **Agente Orquestador / Router:** Clasifica la intencion de la peticion y delega el contexto al especialista indicado.
4. **Matriz de permisos de herramientas:** Validacion previa que asegura que ningun agente ejecute una herramienta ajena a su responsabilidad.

### Criterios de Aceptacion y Medicion
- Cada herramienta valida sus argumentos de entrada mediante schemas de Zod antes de consultar la base de datos.
- Toda ejecucion de herramienta queda aislada dentro del `organization_id` autenticado.
- Si una herramienta falla, el error es capturado limpiamente sin causar excepciones no controladas.

### Pruebas de Verificacion
- **Test AGT-01:** Ejecucion unitaria de la herramienta `check_availability` con rango de fechas; confirmacion de respuesta estructurada con slots libres.
- **Test AGT-02:** Intento del Agente Recepcionista de ejecutar `update_stage` comercial; verificacion de bloqueo por violacion de matriz de permisos.
- **Test AGT-03:** Entrada de texto ambiguo en el Orquestador; validacion de ruteo correcto hacia el especialista correspondiente.

---

## Fase 2: Sistema de Gobernanza y Human-in-the-Loop (HITL)

### Objetivo
Establecer un mecanismo de seguridad y aprobacion para que las acciones de alto impacto propuestas por los agentes no se ejecuten directamente, sino que queden en estado de espera hasta recibir autorizacion de un usuario del negocio.

### Politicas de Criticidad y Aprobacion

| Nivel | Tipo de Accion | Requiere Aprobacion | Ejemplo |
|---|---|---|---|
| **Bajo** | Lectura o consultas | No | Consultar disponibilidad, buscar un contacto |
| **Bajo** | Registro de comunicacion | No | Guardar mensaje recibido, crear nota de llamada |
| **Medio** | Agendamiento estandar | Configurable | Agendar cita en horario libre regular |
| **Alto** | Transaccion comercial | Si | Aplicar descuento superior al 10%, cambiar etapa a Ganada |
| **Alto** | Cancelacion o eliminacion | Si | Cancelar cita confirmada, archivar oportunidad de venta |

### Entregables
1. **Mecanismo de interceptacion:** Antes de ejecutar una herramienta marcada como `critical`, el ejecutor genera un registro en `agent_actions` con `status = 'pending'` y `requires_approval = true`.
2. **Rutas de API de aprobacion:**
   - `POST /api/agents/actions/[id]/approve`: Valida permisos del usuario, ejecuta la accion y actualiza a `executed`.
   - `POST /api/agents/actions/[id]/reject`: Marca la accion como `rejected` con notas de justificacion y retroalimenta al agente.
3. **Historial de auditoria:** Registro detallado de que usuario autorizo o rechazo cada propuesta.

### Criterios de Aceptacion y Medicion
- Las herramientas marcadas como sensibles jamas modifican las tablas principales del negocio sin una transaccion de aprobacion previa.
- El tiempo entre la creacion de la propuesta y su revision queda medido para reportar tiempos de respuesta humanos.

### Pruebas de Verificacion
- **Test HITL-01:** Un agente propone un descuento del 20% en una cotizacion. Verificar que la cotizacion no cambia de precio y se genera una fila en `agent_actions` en estado `pending`.
- **Test HITL-02:** Enviar `POST /api/agents/actions/[id]/approve` con sesion de usuario valido. Verificar que la accion cambia a `executed` y el descuento se refleja en la cotizacion.
- **Test HITL-03:** Enviar `POST /api/agents/actions/[id]/reject`. Verificar que los datos de la cotizacion permanecen inalterados.

---

## Fase 3: UI de Supervision y Bandeja de Aprobaciones

### Objetivo
Proveer al personal y administradores de la empresa una interfaz clara y centralizada para monitorear la actividad de los agentes de IA, revisar las acciones en espera y configurar politicas de operacion.

### Entregables
1. **Bandeja de Acciones de Agentes (`/agents/inbox`):**
   - Lista filtrable de acciones pendientes de revision.
   - Vista de diferencia (diff) entre el estado actual y el cambio propuesto por el agente.
   - Botones de accion rapida: Aprobar, Modificar valores, Rechazar con comentario.
2. **Centro de Control de Agentes (`/agents/settings`):**
   - Interruptores individuales para habilitar o deshabilitar cada agente.
   - Selector de nivel de autonomia por agente:
     - Conservador: Todas las escrituras requieren aprobacion.
     - Equilibrado: Solo acciones criticas requieren aprobacion.
     - Autonomo: Ejecucion directa segun reglas del negocio.
3. **Indicador de autor en perfiles de contacto y citas:**
   - Badges visuales en el historial de actividades que diferencian si la accion fue realizada por un humano o por un agente especifico.

### Criterios de Aceptacion y Medicion
- El usuario puede procesar (aprobar o rechazar) una accion pendiente en menos de 3 clics desde cualquier vista del sistema.
- La bandeja de aprobaciones se actualiza en tiempo real cuando un agente genera una nueva propuesta.

### Pruebas de Verificacion
- **Test UI-01:** Apertura de modal de aprobacion; comprobar que se muestra el motivo argumentado por el agente y el payload exacto de la modificacion.
- **Test UI-02:** Aprobacion desde la interfaz; validar que el elemento desaparece de la bandeja de pendientes y se actualiza el contador de la campana de notificaciones.

---

## Fase 4: Adaptabilidad Modular por Industria (Industry Packs)

### Objetivo
Permitir que la misma plataforma se adapte dinamicamente al tipo de negocio seleccionado por el usuario, activando los modulos, campos y vocabulario adecuados sin duplicar codigo.

### Configuracion de Modulos por Vertical

| Industria | Modulos Activos | Entidad Principal de Agenda | Vocabulario de Contacto |
|---|---|---|---|
| **Salud / Clinicas** | Citas, Expediente, Servicios, Presupuestos | Cita medica | Paciente |
| **Restaurantes** | Reservaciones, Mesas, Fidelizacion | Reservacion de mesa | Comensal / Cliente |
| **Inmobiliarias** | Propiedades, Pipeline de Ventas, Citas | Visita a propiedad | Prospecto / Comprador |
| **Servicios Pro** | Cotizaciones, Tareas, Oportunidades | Reunion de consultoria | Cliente |

### Entregables
1. **Motor de configuracion de tenant:** Tabla `organizations.settings` almacena el diccionario de modulos activos y etiquetas de interfaz.
2. **Navegacion dinamica en Sidebar:** El menu lateral renderiza solo las rutas pertinentes a los modulos activos de la empresa.
3. **Inyeccion de contexto en prompts:** Los agentes reciben las directrices y reglas especificas de la industria configurada (terminologia, limites de tiempo, politicas de cancelacion).

### Criterios de Aceptacion y Medicion
- Al cambiar la industria de una organizacion de `health` a `restaurant`, el sidebar oculta "Presupuestos dentales" y muestra "Reservaciones y Mesas".
- Los agentes utilizan la terminologia adecuada para la industria activa en todas sus respuestas y registros.

### Pruebas de Verificacion
- **Test IND-01:** Crear organizacion con vertical `real_estate`; comprobar que el endpoint de schema devuelve activos los modulos de `pipeline` y `visits`, y desactiva modulos medicos.
- **Test IND-02:** Verificar que el Agente Recepcionista saluda y solicita informacion orientada a la compra/renta de inmuebles cuando la vertical activa es `real_estate`.

---

## Fase 5: Pipeline de Ventas y Agente Analista

### Objetivo
Implementar la visualizacion comercial completa (Kanban) y poner en funcionamiento al Agente Analista para generar sintesis ejecutivas y deteccion de cuellos de botella operativos.

### Entregables
1. **Tablero Kanban de Oportunidades (`/pipeline`):**
   - Columnas por etapa comercial (Lead, Calificado, Propuesta, Negociacion, Ganado, Perdido).
   - Movimiento de tarjetas drag-and-drop con actualizacion de estado y registro de actividad automatica.
2. **Generador del Agente Analista (`lib/agents/analyst.ts`):**
   - Consulta consolidada de metricas: tiempos de respuesta a nuevos prospectos, porcentaje de conversion de cotizaciones, porcentaje de inasistencias (no-shows).
   - Generador de resumen ejecutivo en lenguaje natural estructurado.
3. **Widget "Briefing Diario" en el Dashboard:**
   - Tarjeta interactiva al inicio del panel que expone el resumen generado por el Agente Analista con alertas de atencion prioritaria.

### Criterios de Aceptacion y Medicion
- El Agente Analista genera reportes basados estrictamente en datos cuantificables de las tablas de la base de datos sin alucinaciones de cifras.
- El tablero Kanban responde en menos de 200 ms al cambiar una oportunidad de etapa.

### Pruebas de Verificacion
- **Test ANL-01:** Ejecutar el calculo de metricas en un tenant con datos simulados de 30 dias; verificar que las cifras del reporte coincidan exactamente con las queries SQL de control.
- **Test ANL-02:** Crear una oportunidad estancada sin actividad por 15 dias; verificar que el Agente Analista la liste explicitamente en su seccion de acciones recomendadas.

---

## Fase 6: Pruebas de Integracion End-to-End y Certificacion

### Objetivo
Asegurar la estabilidad operativa, la seguridad en el manejo de datos multi-tenant y la precision de los flujos de agentes en simulaciones completas de negocio.

### Bateria de Pruebas Requeridas

1. **Escenario Clinica Medica:**
   - Entrada de prospecto via recepcionista.
   - Calificacion y creacion de cita por agente de agenda.
   - Cancelacion de cita con solicitud de aprobacion humana.
   - Verificacion de logs y registros correspondientes.

2. **Escenario Restaurante:**
   - Solicitud de reservacion para grupo grande (caso critico).
   - Disparo de solicitud de aprobacion humana por exceder limite de comensales.
   - Aprobacion humana desde el inbox y confirmacion de estado.

3. **Escenario Inmobiliario / B2B:**
   - Deteccion de lead sin respuesta por el agente de seguimiento tras 48 horas.
   - Creacion automatica de tarea de recordatorio asignada al asesor humano.

### Criterios de Aceptacion y Medicion
- Cero regresiones en la funcionalidad existente de autenticacion y gestion de citas.
- 100% de las acciones criticas requieren intervencion humana demostrable.
- Cobertura de pruebas de integracion en todas las herramientas del catalogo.
