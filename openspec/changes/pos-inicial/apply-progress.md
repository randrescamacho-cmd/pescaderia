# Apply Progress: pos-inicial

## Estado global: 67/67 tareas de Fase 1-9 completas (5/5 + 8/8 + 8/8 + 8/8 + 10/10 + 8/8 + 7/7 + 7/7 + 6/6)

- PR1 (Fases 1-2, Setup + BD/Migraciones): completo, verificado.
- PR2 (Fases 3-4, Auth PIN + Catálogo): completo — ver sección "PR2" abajo.
- PR3 (Fases 5-6, Ventas + Caja): completo (5.10 se cerró en PR4 por
  dependencia declarada de Fase 9) — ver sección "PR3" abajo.
- PR4 (Fases 7-9, Créditos + Corte del Día + Impresión): completo — ver
  sección "PR4" abajo. WARNING-1 de `verify-report-pr4.md` (redondeo de
  `cashOnHand`) corregido en un fix puntual antes de PR5 — ver sección
  "PR4 fix" abajo. WARNING-2 (`sales:create`+`credit:grant` no atómicos)
  queda como **riesgo aceptado y diferido por decisión explícita del
  usuario** — ver misma sección para el detalle completo, NO implementado.
- PR5 (Fases 10-11, Empaquetado/CI + Validación en sitio): pendiente, único
  PR restante del plan de 5.

---

# PR1 (Fases 1-2)

## Scope de este PR

Solo Fase 1 (Setup del Proyecto) y Fase 2 (Esquema de BD y Migraciones), por
plan de 5 PRs encadenados (`tasks.md` → Review Workload Forecast → Suggested
Work Units → Unit 1). Fases 3-11 quedan explícitamente fuera — ver "Pendiente
para PR2".

## Estado: 13/13 tareas de Fase 1+2 completas (5/5 + 8/8)

## Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Versión de Electron | `44.3.0` (última estable al momento de este PR) | Empaqueta Node `24.20.0` (verificado vía `releases.electronjs.org/releases.json`), muy por encima del umbral donde `node:sqlite` deja de requerir flag. |
| Flag `--experimental-sqlite` | **NO requerido** para Node 24.20.0 | Confirmado leyendo `doc/api/sqlite.md` del propio repo de Node (tag `v24.20.0`): el flag se quitó en v22.13.0/v23.4.0; en v24.15.0 `node:sqlite` pasó a "Release Candidate" (stability 1.2), sin flag y sin warning experimental. Se agregó de todos modos una guardia defensiva (`src/main/node-version.ts` + `src/main/index.ts`) que agrega el switch condicionalmente si algún día se baja de versión de Electron/Node — cubierta con 5 tests unitarios (triangulación en los límites v22.13.0/v23.4.0). |
| `vite` / `@vitejs/plugin-react` | `vite@^7.3.6` + `@vitejs/plugin-react@^5.1.1` (NO `vite@8`/`plugin-react@6`) | `electron-vite@5.0.0` declara `peerDependencies.vite: "^5 || ^6 || ^7"` — no soporta Vite 8 todavía. `@vitejs/plugin-react@6` requiere `vite@^8`, así que se fijó la última versión de `plugin-react` (`5.1.1`) compatible con Vite 7. |
| `typescript` | `^5.9.3` (NO `typescript@7.x`, que es el `latest` real en el registro) | TypeScript 7 (compilador nativo) es nuevo en el ecosistema; el tooling de Electron/Vite/ESLint alrededor todavía asume TS 5.x. Para una base de un proyecto nuevo y crítico para el negocio, se prefirió estabilidad de todo el toolchain sobre adoptar el compilador más nuevo. Puede revisarse en un PR posterior cuando el ecosistema confirme soporte. |
| `@types/node` | `^24.13.4` (major 24, no 22 ni 26) | Debe incluir las definiciones de `node:sqlite` (confirmado que `sqlite.d.ts` existe desde `@types/node@24.x`) y alinearse con el Node 24 que empaqueta el Electron elegido. |
| Estructura preload/renderer | `src/main/preload.ts` (no `src/preload/`), `src/renderer/{screens,components,index.html}` directo (no `src/renderer/src/`) | Sigue literalmente `design.md` "Estructura de Carpetas", que difiere del template default de `electron-vite`. Se configuró `electron.vite.config.ts` con `preload.build.rollupOptions.input` apuntando a `src/main/preload.ts`; el `renderer.root` default de electron-vite ya coincide con `src/renderer/` sin necesidad de override. |
| PIN seed placeholder | `usuario = "1111"`, `administrador = "9999"`, hasheados con `scryptSync` + salt aleatorio (mismo mecanismo que design.md Decisión 4) | La migración `2:seed_roles` necesita satisfacer `pin_salt`/`pin_hash NOT NULL` **antes** de que exista `src/main/auth/pin.ts` (Fase 3, fuera de este PR). Se usó `node:crypto` directamente dentro de `migrations/index.ts` — NO se creó el módulo de auth reutilizable ni ninguna lógica de login/verify. Documentado con comentario en el código: la Fase 3 DEBE forzar/recomendar cambio de PIN en el primer uso real. |

## Deviations from Design (schema)

Estas 3 desviaciones respecto al esquema literal de `design.md` fueron
necesarias para que el esquema soporte lo que las specs (fuente de verdad)
exigen. Documentadas también como comentarios inline en
`src/main/db/migrations/index.ts` y en `db/schema.sql`:

1. **`products.cost` y `sale_lines.unit_cost` ahora son `NULLABLE`** (design.md los declaraba `NOT NULL`). `catalog-management/spec.md` y `daily-report/spec.md` exigen distinguir "costo capturado como 0" de "costo NO capturado" (para la advertencia de productos sin costo en Ganancia del Día). `NULL` = no capturado; el cálculo de ganancia lo trata como 0.
2. **`sale_payments.method` ahora acepta `'credito'`, y se agregó `sale_payments.customer_id` (nullable, FK a `customers`)**. `sales-transactions/spec.md` (Split Payment per Sale) y `customer-credit/spec.md` requieren que una porción de pago dividido pueda ser `credito` asociada a un cliente. El esquema original de `design.md` solo permitía `'efectivo'/'tarjeta'` en esta tabla — habría sido imposible registrar una venta con crédito dividido tal como las specs lo exigen.
3. **`cash_movements` agrega la columna `provider` (nullable)**. `cash-register/spec.md` exige que una salida capture monto + motivo + "nombre del proveedor" como datos independientes; `design.md` solo tenía `concept` (motivo).

Además: reordené las `CREATE TABLE` (customers antes de shifts/sales) respecto
al orden literal de `design.md`, únicamente para que las FKs de
`sale_payments`/`customer_credits` → `customers` puedan declararse sin
forward-reference. Sin impacto funcional.

## Deviation: test runner (`node:test` → `vitest`)

`tasks.md` (2.7/2.8) y `design.md` ("Testing Strategy") mencionan `node:test`.
`openspec/config.yaml` (`rules.apply.test_command` y `rules.verify.test_command`)
fija explícitamente `npx vitest run`, reiterado también en las instrucciones
directas de este PR ("Test runner: `npx vitest run`"). Se usó `vitest` como
runner real — no se creó ninguna prueba con `node:test`. Sin impacto en
cobertura: `vitest` ejecuta contra el mismo `node:sqlite` real (no hay mocks).

## Departamentos seed: 9, no 8 — RESUELTO (commit `bae2a87`)

`catalog-management/spec.md` listaba 8 departamentos de ejemplo y omitía
"Juguetes" (sí presente en `config.yaml`, fuente primaria, y en el mensaje
original del usuario). El código de este PR ya sembró los 9 (superset
correcto). Después de completado este PR, el orquestador corrigió
`catalog-management/spec.md` para agregar "Juguetes" a la lista (commit
`bae2a87`, fuera de esta sesión de `sdd-apply`, verificado contra el
requisito original del usuario antes de editar) — no quedó como pendiente
abierto para un PR de specs futuro; ya está alineado.

## Archivos creados

| Archivo | Qué hace |
|---|---|
| `package.json`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json` | Config raíz, TS estricto separado main/preload vs renderer (project references) |
| `electron.vite.config.ts` | Build config: main default, preload apuntando a `src/main/preload.ts`, renderer con plugin React + alias `@renderer` |
| `electron-builder.yml` | Target `dmg` mac arm64+x64, `identity: null` (firma ad-hoc se aplica en CI, Fase 10) |
| `vitest.config.ts` | Runner de tests, `environment: 'node'`, incluye `src/**/*.test.ts` |
| `.gitignore` | `node_modules/`, `out/`, `dist/`, `*.sqlite`, etc. |
| `src/main/index.ts` | Entry point: guardia de flag experimental, `createWindow`, conecta DB + corre migraciones en `app.whenReady` |
| `src/main/preload.ts` | `contextBridge` stub (sin API todavía — Fase 3+ la llena) |
| `src/main/node-version.ts` + `.test.ts` | Función pura `needsExperimentalSqliteFlag` (TDD completo) |
| `src/main/db/connection.ts` + `.test.ts` | Abre `node:sqlite`, fuerza `PRAGMA foreign_keys` |
| `src/main/db/migrate.ts` | Runner de migraciones transaccional e idempotente |
| `src/main/db/migrations/index.ts` | Array de migraciones `1:init`/`2:seed_roles`/`3:seed_departments` con el esquema completo (11 tablas + `schema_migrations`) |
| `src/main/db/migrate.test.ts` | 9 tests: orden, idempotencia, existencia de tablas, seeds, FK enforcement, CHECK constraints, nullability |
| `src/renderer/index.html`, `main.tsx`, `App.tsx`, `env.d.ts` | Scaffold mínimo de renderer (placeholder, sin pantallas reales) |
| `db/schema.sql` | Espejo de documentación (no runtime) con las 3 desviaciones anotadas |
| `src/main/{ipc,printing,auth}/.gitkeep`, `src/renderer/{screens,components}/.gitkeep` | Carpetas vacías reservadas para Fases 3+ (design.md "Estructura de Carpetas") |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.5 | `src/main/node-version.test.ts` | Unit | N/A (new) | ✅ Written (referenciaba función inexistente) | ✅ Passed | ✅ 5 casos (límites v22.13.0, v23.4.0, v23.3.9, v24.20.0, v22.5.0) | ➖ None needed (función de 5 líneas, ya mínima) |
| 2.1 | `src/main/db/connection.test.ts` | Unit (integration real contra `node:sqlite`, sin mocks) | N/A (new) | ✅ Written | ✅ Passed | ✅ 2 casos (exec funciona / pragma foreign_keys=1) | ➖ None needed |
| 2.2/2.3/2.4/2.5/2.7/2.8 | `src/main/db/migrate.test.ts` | Integration (contra `:memory:` real, sin mocks) | N/A (new) | ✅ Written | ✅ Passed | ✅ 9 casos (orden, idempotencia, 12 tablas, roles+hash real, 9 deptos, FK enforcement, credito+customer_id, CHECK invalido, cost NULL, provider) | ✅ Extraída `getAppliedVersions` como función propia; BEGIN/COMMIT/ROLLBACK explícito por versión |

### Test Summary

- **Total tests written**: 17 (5 + 3 + 9, ver tabla arriba)
- **Total tests passing**: 17/17
- **Layers used**: Unit (5 puros), Integration (12 contra `node:sqlite` real — ni un mock en todo el suite)
- **Approval tests** (refactoring): None — no había código previo que refactorizar (proyecto greenfield)
- **Pure functions created**: 1 (`needsExperimentalSqliteFlag`). El resto (`runMigrations`, `createConnection`) son necesariamente impuros (I/O a SQLite), pero sin mocks: se prueban contra una base de datos real (`:memory:` o archivo temporal), no contra dobles de prueba.

## Verificación manual end-to-end (no solo unit tests)

Además del suite de `vitest`, se verificó manualmente que la app real bootea
y corre las migraciones reales (no solo en test):

```
npm run dev   →  main+preload+renderer build OK, proceso Electron arranca
                 sin errores (el único crash inicial fue por
                 ELECTRON_RUN_AS_NODE=1 del sandbox del agente, no del código;
                 al desactivar esa var para el comando, el proceso corre
                 normalmente hasta que se mata por timeout de verificación)
npm run build →  typecheck limpio + build de producción de main/preload/renderer OK
npx electron-builder --mac --dir --publish never
              →  config de electron-builder.yml carga sin errores de schema;
                 el único error es el esperado "Build for macOS is supported
                 only on macOS" (documentado en design.md — requiere runner
                 macOS o Mac física, Fase 10)
```

Se inspeccionó el archivo `.sqlite` real generado en
`%APPDATA%/pescaderia-pos/pescaderia-pos.sqlite` tras el boot: las 12 tablas,
las 3 migraciones registradas en `schema_migrations`, los 2 roles y los 9
departamentos aparecen correctamente — confirma que el flujo real
(`connection.ts` → `migrate.ts` → `migrations/index.ts`) funciona, no solo el
test aislado.

## Comandos verificados (todos pasan)

```
npm install                                    → 0 vulnerabilities, exit 0
npx vitest run                                 → 3 files, 17/17 tests passed
npm run typecheck                               → tsc --noEmit limpio (node + web)
npm run build                                   → typecheck + electron-vite build OK
npx electron-builder --mac --dir --publish never → config válida (bloqueo esperado: requiere macOS)
```

## Pendiente para PR2 (Fases 3-4, NO implementado en este PR) — RESUELTO en PR2

- **Fase 3 — Auth PIN**: `src/main/auth/pin.ts` (hash/verify reutilizable con
  `scryptSync`+`timingSafeEqual` — reusar el MISMO patrón que ya usa
  `migrations/index.ts` para el seed), IPC `auth:login`/`auth:changePin`,
  pantalla de login con teclado numérico, sesión en memoria del renderer.
  **Importante**: Fase 3 debería forzar o recomendar fuertemente cambiar los
  PIN placeholder (`1111`/`9999`) sembrados en este PR.
- **Fase 4 — Catálogo**: IPC de departamentos/productos con soft-delete y
  bloqueo de borrado si hay productos activos, guard de rol Admin-only,
  pantallas de Departamentos/Productos.
- Ningún archivo de `src/main/ipc/`, `src/main/auth/`, `src/main/printing/` ni
  `src/renderer/screens/`, `src/renderer/components/` tiene contenido real
  todavía — solo `.gitkeep` reservando la carpeta (design.md "Estructura de
  Carpetas").
- `src/main/preload.ts` expone un objeto `api` vacío — Fase 3 debe llenarlo
  vía `contextBridge.exposeInMainWorld` con los métodos reales de IPC.

Todo lo anterior se implementó en PR2 (ver sección "PR2 (Fases 3-4)" abajo).
`migrations/index.ts` se refactorizó en PR2 para reusar `hashPin` de
`src/main/auth/pin.ts` en vez de la función inline `hashPlaceholderPin` que
tenía este PR — la duplicación era intencional en su momento (el módulo de
auth no existía todavía), y se eliminó apenas fue posible.

## Status (PR1)

13/13 tasks (Fase 1: 5/5, Fase 2: 8/8) completas. Verificado, listo para PR2.

---

# PR2 (Fases 3-4): Autenticación por PIN de Rol + Catálogo

## Scope de este PR

Solo Fase 3 (Autenticación por PIN de Rol) y Fase 4 (Catálogo: departamentos
y productos), por plan de 5 PRs encadenados (`tasks.md` → Review Workload
Forecast → Suggested Work Units → Unit 2). Fases 5-11 quedan explícitamente
fuera — ver "Pendiente para PR3".

## Estado: 16/16 tareas de Fase 3+4 completas (8/8 + 8/8)

## Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Ubicación autoritativa de la sesión (rol activo) | **Main process** (`src/main/auth/session.ts`, `createSessionStore`), no solo el renderer | `design.md` dice literalmente "la sesión vive solo en memoria del renderer", pero tasks.md 4.4 exige un "Role guard middleware" que rechace llamadas IPC Admin-only. Si el renderer fuera la única fuente de verdad, cualquier `invoke` directo (sin pasar por la UI) podría declarar el rol que quisiera y el guard no protegería nada real. Se preserva la restricción de fondo de design.md (no se persiste a disco, se pierde al cerrar la app) creando el store una sola vez en `app.whenReady()` (`src/main/index.ts`) — nunca toca disco, solo vive en memoria del proceso. El renderer mantiene su propia copia en `useState` (`App.tsx`) únicamente para decidir qué pantallas mostrar; la fuente de verdad que bloquea acciones es el store del main process. Documentado inline en `session.ts`. |
| Guard de rol como función pura | `assertRole(currentRole, requiredRole)` en `src/main/auth/session.ts`, sin dependencia de Electron | Permite TDD real (RED-GREEN) del guard sin mocks de `ipcMain`/`ipcRenderer`. Los handlers IPC (`ipc/auth.ts`, `ipc/catalog.ts`) solo la invocan — la lógica de negocio del guard vive y se prueba en un solo lugar. |
| Comparación de PIN como función pura | `authenticate(pin, roles)` en `src/main/auth/authenticate.ts`, recibe las credenciales ya leídas de BD | Misma razón que el guard: separa "leer de SQLite" (`db/queries/roles.ts`, impuro, probado contra `:memory:` real sin mocks — mismo criterio que PR1) de "decidir qué rol coincide" (puro, trivial de testear con `hashPin` real). |
| Refactor de `migrations/index.ts` | Reemplazó su función inline `hashPlaceholderPin` por `hashPin` de `src/main/auth/pin.ts` | PR1 documentó esto explícitamente como pendiente ("el módulo de auth reutilizable... Fase 3, fuera de este PR"). Se hizo con Safety Net primero (`migrate.test.ts` 10/10 verde antes de tocar el archivo) y se confirmó verde después — cero cambio de comportamiento, solo eliminación de duplicación. |
| Tipos de contrato IPC compartidos | Nuevo directorio `src/shared/ipc-types.ts`, incluido en `tsconfig.node.json` Y `tsconfig.web.json` | `design.md` no menciona una carpeta `shared/`, pero sin ella `preload.ts` (lado main) y `ipc-client.ts` (lado renderer) habrían duplicado las interfaces `Role`/`Department`/`Product`/`PosApi`, con alto riesgo de que se desincronizaran. Es la única forma limpia de compartir tipos entre los dos `tsconfig` separados (uno no incluye `src/main`, el otro no incluye `src/renderer`). Documentado como deviation menor de la "Estructura de Carpetas" de `design.md`. |
| Guard de catálogo: qué se protege y qué no | `assertRole(session.getRole(), 'administrador')` SOLO antes de create/update/delete de departamentos y productos. `listDepartments`, `listProducts` y `findByBarcode` quedan SIN guard | `auth-roles/spec.md` "Administrator-Only Actions" solo restringe crear/editar/eliminar. El rol Usuario necesita poder leer el catálogo (buscar por código de barras) para vender en la Fase 5 (siguiente PR) — bloquear la lectura rompería ese flujo sin que ninguna spec lo exija. |
| Placeholder PIN (`1111`/`9999`) — no se forzó cambio obligatorio bloqueante | Se implementó `auth:changePin` (Admin-only) y quedó disponible desde el primer login, pero NO se agregó un modal bloqueante de "debes cambiar tu PIN" en este PR | Ninguna spec (`auth-roles/spec.md`) exige un flujo de cambio de PIN *forzoso* al primer login — solo que el cambio de PIN esté restringido a Administrador (cumplido). Agregar un bloqueo obligatorio sin un requisito explícito habría sido diseño no solicitado (freelancing). Queda como una mejora candidata a proponerse explícitamente si el usuario la quiere, no como tarea implícita de tasks.md 3.5. |
| Sin router de renderer | Navegación manual con `useState<Screen>` en `App.tsx` (`home`/`departamentos`/`productos`) | Solo 3 pantallas en este PR (Login, Departamentos, Productos); agregar `react-router` u otra librería para 3 pantallas habría sido una dependencia nueva sin justificación todavía. Se reevaluará cuando Fases 5-9 agreguen Ventas/Caja/Créditos/Corte del Día (más pantallas, posible necesidad real de router). |

## Deviations from Design

1. **Ubicación de la sesión** (main process, no solo renderer) — ver tabla de
   Decisiones arriba. Es la única forma de que el guard de rol (tasks.md 4.4)
   sea real y no decorativo.
2. **`src/shared/ipc-types.ts` no existe en el árbol de `design.md`** — ver
   tabla de Decisiones. Sin impacto funcional; es puramente para no duplicar
   tipos entre main y renderer.
3. **Deviation de test runner ya documentada en PR1 se repite aquí**:
   tasks.md 3.2 y 4.5 dicen `node:test`; se usó `vitest` (mismo criterio que
   2.7/2.8 — `openspec/config.yaml` fija `npx vitest run`).

## Testing scope decision: qué SÍ y qué NO se cubrió con TDD

Siguiendo el mismo criterio de PR1 ("Testing Strategy" de `design.md` no
incluye una capa de component-testing de UI, y `App.tsx`/`preload.ts` de PR1
ya sentaron el precedente de wiring sin test dedicado):

- **SÍ, con RED-GREEN-TRIANGULATE completo**: `pin.ts` (hash/verify),
  `authenticate.ts` (resolución de rol desde PIN), `session.ts` (session
  store + guard `assertRole`), `db/queries/roles.ts`, `db/queries/departments.ts`
  (incluye el bloqueo de borrado con productos asignados) y
  `db/queries/products.ts` (incluye `validateProductInput` — precio > 0,
  departamento obligatorio).
- **SÍ, como integración de wiring (escrito después de la composición, no
  RED-first puro, pero compone unidades que SÍ fueron TDD'd)**: `ipc/auth.ts`
  e `ipc/catalog.ts` — se agregaron pruebas con un `IpcMain` falso
  (`.handle` capturado en un `Map`) para verificar el guard de rol end-to-end
  a través del canal IPC real, no solo la función pura `assertRole` aislada.
  Esto cierra la brecha entre "el guard puro está probado" y "el guard
  realmente protege el canal IPC".
- **NO cubierto con pruebas automatizadas**: `preload.ts`, `src/main/index.ts`
  (wiring, mismo precedente que PR1) y las pantallas de renderer
  (`Login.tsx`, `Departamentos.tsx`, `Productos.tsx`, `App.tsx`). No hay
  `@testing-library/react` ni ninguna librería de testing de componentes en
  el proyecto, y `design.md` "Testing Strategy" no define una capa de
  component-testing (solo Unit/Integration a nivel de lógica de negocio y
  E2E manual con hardware real). Agregar una librería nueva solo para este
  PR habría sido una decisión de tooling no solicitada — se deja como
  propuesta explícita para un PR futuro si el usuario la quiere.

## Archivos creados

| Archivo | Qué hace |
|---|---|
| `src/main/auth/pin.ts` + `.test.ts` | `hashPin`/`verifyPin` reutilizable (scryptSync + timingSafeEqual) |
| `src/main/auth/authenticate.ts` + `.test.ts` | `authenticate(pin, roles)` — resuelve el rol desde el PIN, función pura |
| `src/main/auth/session.ts` + `.test.ts` | `createSessionStore` (rol activo en memoria del main process) + `assertRole` (guard de rol puro) |
| `src/main/db/queries/roles.ts` + `.test.ts` | `getRoleCredentials`/`updateRolePin` contra SQLite real |
| `src/main/db/queries/departments.ts` + `.test.ts` | CRUD de departamentos + soft-delete bloqueado si hay productos activos asignados |
| `src/main/db/queries/products.ts` + `.test.ts` | CRUD de productos + `validateProductInput` (precio > 0, departamento obligatorio) + `findByBarcode` |
| `src/main/ipc/auth.ts` + `.test.ts` | Wiring `auth:login`/`auth:changePin`/`auth:logout` + guard de rol end-to-end probado con `IpcMain` falso |
| `src/main/ipc/catalog.ts` + `.test.ts` | Wiring `catalog:*` (departamentos/productos) + guard de rol end-to-end probado con `IpcMain` falso |
| `src/shared/ipc-types.ts` | Contrato IPC compartido (Role, Department, Product, PosApi, etc.) entre main y renderer |
| `src/renderer/screens/Login.tsx` | Pantalla de login con teclado numérico (0-9, borrar, confirmar) |
| `src/renderer/screens/Departamentos.tsx` | CRUD de departamentos (Admin only) + mensaje de borrado bloqueado con productos que lo impiden |
| `src/renderer/screens/Productos.tsx` | CRUD de productos (Admin only): nombre, precio, costo opcional, departamento (select), código de barras opcional |
| `src/renderer/ipc-client.ts` | Wrapper tipado sobre `window.api` (design.md "Estructura de Carpetas") |
| `src/renderer/App.tsx` (modificado) | Enruta entre Login y las pantallas Admin-only según el rol; navegación manual sin router (ver Decisiones) |
| `src/main/preload.ts` (modificado) | Expone la API real (`auth.*`, `catalog.*`) vía `contextBridge` — antes era un objeto vacío |
| `src/main/index.ts` (modificado) | Crea el `SessionStore` una vez por arranque y registra `registerAuthIpc`/`registerCatalogIpc` |
| `src/main/db/migrations/index.ts` (refactor) | Reusa `hashPin` de `auth/pin.ts` en vez de duplicar la lógica de hashing (ver Decisiones) |
| `src/renderer/env.d.ts` (modificado) | Declara `Window.api: PosApi` global |
| `tsconfig.node.json`, `tsconfig.web.json` (modificados) | Incluyen `src/shared/**/*` para que ambos lados compartan los tipos de contrato IPC |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 3.1/3.2/3.3 | `src/main/auth/pin.test.ts` | Unit | N/A (new) | ✅ Written (referenciaba `hashPin`/`verifyPin` inexistentes) | ✅ Passed | ✅ 3 casos (correcto, incorrecto, salts distintos por llamada) | ➖ None needed (función ya mínima) |
| 3.4 (lógica de resolución de rol) | `src/main/auth/authenticate.test.ts` | Unit | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 casos (usuario, administrador, ninguno) | ➖ None needed |
| 3.5/4.4 (guard de rol) | `src/main/auth/session.test.ts` | Unit | N/A (new) | ✅ Written (referenciaba `createSessionStore`/`assertRole` inexistentes) | ✅ Passed | ✅ 6 casos (store: sin sesión/login/logout; guard: coincide/no coincide/null) | ➖ None needed |
| 3.4 (lectura de credenciales) | `src/main/db/queries/roles.test.ts` | Integration (contra `:memory:` real, sin mocks) | N/A (new) | ✅ Written | ✅ Passed | ✅ 2 casos (lectura, actualización aislada por rol) | ➖ None needed |
| 4.1/4.5/4.6 (departamentos) | `src/main/db/queries/departments.test.ts` | Integration (contra `:memory:` real, sin mocks) | N/A (new) | ✅ Written | ✅ Passed | ✅ 5 casos (listar, crear, renombrar, bloqueo por productos activos, soft-delete sin productos) | ➖ None needed |
| 4.2/4.5/4.6 (productos) | `src/main/db/queries/products.test.ts` | Integration (contra `:memory:` real, sin mocks) + Unit (`validateProductInput`) | N/A (new) | ✅ Written | ✅ Passed | ✅ 10 casos (validación x3, crear x4, reasignar, soft-delete, findByBarcode x2) | ➖ None needed |
| 3.4/3.5 (wiring, guard end-to-end) | `src/main/ipc/auth.test.ts` | Integration (IpcMain falso, sin Electron real) | ✅ (pin.ts/authenticate.ts/session.ts ya verdes antes de escribir esto) | ✅ Written (después de componer el wiring — ver "Testing scope decision") | ✅ Passed | ✅ 4 casos (login ok, login rechazado, changePin rechazado por rol, changePin exitoso + nuevo PIN funciona) | ➖ None needed |
| 4.4 (wiring, guard end-to-end) | `src/main/ipc/catalog.test.ts` | Integration (IpcMain falso, sin Electron real) | ✅ (departments.ts/products.ts ya verdes antes de escribir esto) | ✅ Written (después de componer el wiring) | ✅ Passed | ✅ 3 casos (rechazado por rol usuario, permitido por administrador, lectura sin guard) | ➖ None needed |
| PR1 refactor | `src/main/db/migrate.test.ts` (ya existente) | Integration | ✅ 10/10 antes del refactor de `migrations/index.ts` | N/A (approval test, no test nuevo) | ✅ 10/10 después del refactor | N/A | ✅ Eliminada `hashPlaceholderPin` duplicada, ahora reusa `hashPin` |

### Test Summary

- **Total tests written (PR2)**: 37 (pin 3 + authenticate 3 + session 6 + roles 2 + departments 5 + products 11 + ipc/auth 4 + ipc/catalog 3; `products.test.ts` incluye 3 de `validateProductInput` + 8 de las funciones de BD)
- **Total tests passing (PR2)**: 37/37
- **Total tests passing (proyecto completo, PR1+PR2)**: 54/54 (`npx vitest run`, 11 archivos)
- **Layers used**: Unit (pin, authenticate, session, validateProductInput — puros), Integration (roles/departments/products contra `node:sqlite` real sin mocks; ipc/auth e ipc/catalog con `IpcMain` falso)
- **Approval tests** (refactoring): 1 — `migrate.test.ts` (10/10 antes y después del refactor de `migrations/index.ts`)
- **Pure functions created**: `hashPin`, `verifyPin`, `authenticate`, `assertRole`, `validateProductInput` (5)
- **Mocks usados**: 0 mocks de librerías/módulos externos. El único "doble de prueba" es el objeto `IpcMain` falso en `ipc/*.test.ts` (implementa solo `.handle`, captura el listener real) — no es un mock de comportamiento, es un stub minimal de la interfaz de registro para poder invocar los handlers reales sin Electron.

## Comandos verificados (todos pasan)

```
npx vitest run   → 11 files, 54/54 tests passed
npm run typecheck → tsc --noEmit limpio (node + web)
npm run build     → typecheck + electron-vite build OK
npm run dev       → main+preload build OK, renderer sirve en localhost:5173,
                    proceso Electron arranca (los unicos mensajes en stderr
                    son "Network service crashed"/"GPU process exited" del
                    sandbox del agente, mismo patron que PR1 documento con
                    ELECTRON_RUN_AS_NODE — no son errores de la aplicacion)
```

## Pendiente para PR3 (Fases 5-6, NO implementado en este PR)

- **Fase 5 — Ventas**: `sales:create` transaccional (snapshot de
  departamento/costo/precio en `sale_lines`, ya soportado por el esquema de
  PR1), validaciones (cantidad > 0, al menos 1 línea, suma de pagos == total,
  `credito` requiere cliente), pantalla de Ventas con buffer de escáner
  USB-HID y modal de pago dividido.
- **Fase 6 — Caja**: `cash:openShift`/`cashIn`/`cashOut`/`closeShift` con la
  fórmula de reconciliación de `design.md`, pantallas de apertura/
  entradas-salidas/cierre de turno.
- El `SessionStore` creado en este PR (`src/main/index.ts`) debe reutilizarse
  para saber qué `role_id` abrió/cerró el turno (`shifts.opened_by_role_id`) —
  falta mapear `Role` (string `'usuario'`/`'administrador'`) a `roles.id`
  (INTEGER) para esas FKs; no existe todavía una consulta `getRoleId(db,
  role)`. Dejarlo explícito para que PR3 no lo repita desde cero.
- La pantalla `Ventas` necesitará `catalog:findByBarcode` (ya implementado en
  este PR, sin guard de rol) y un cliente picker/creator que PR3 comparte con
  Fase 7 (Créditos) — no se adelantó nada de eso aquí.
- Ningún archivo de `src/main/printing/` tiene contenido real todavía (Fase 9,
  PR4) — sigue solo con `.gitkeep`.

## Status (PR2)

16/16 tasks (Fase 3: 8/8, Fase 4: 8/8) completas. 29/29 tasks totales
(Fase 1-4) del cambio `pos-inicial`. Listo para `sdd-verify` de este work
unit, o para continuar directo con PR3 (Fases 5-6) según la estrategia de
entrega del usuario.

---

# PR2 follow-up: cierre de 2 hallazgos WARNING de verify-report-pr2.md

## Scope de este follow-up

NO es un PR nuevo del plan de 5 (Fases 5-11 no se tocaron). Cierra 2 de los 3
hallazgos WARNING de una verificación independiente de PR2
(`verify-report-pr2.md`, verdict PASS WITH WARNINGS, 0 CRITICAL):

1. **WARNING 1**: solo `catalog:createDepartment` tenía un test de guard de
   rol a nivel de wiring IPC end-to-end; los otros 5 canales mutantes de
   catálogo (`updateDepartment`, `deleteDepartment`, `createProduct`,
   `updateProduct`, `deleteProduct`) confiaban solo en lectura de código.
2. **WARNING 2**: `Productos.tsx` no exponía una acción "Editar" — el
   backend (`catalog:updateProduct`) ya existía y ya estaba probado a nivel
   de query (`products.test.ts` > "reassigns a product to a different
   department"), pero el escenario de spec "Reasignar producto a otro
   departamento" (`catalog-management/spec.md`, Requirement "Single Fixed
   Department per Product") no era ejecutable por un usuario real todavía.

El WARNING 3 (housekeeping de `state.yaml`) se resolvió como parte de este
mismo follow-up, actualizando `pr_plan[PR2].followup` y `phases.apply.current_pr`
en `state.yaml`.

## 1. Tests de guard IPC faltantes (5 nuevos, `src/main/ipc/catalog.test.ts`)

Se agregaron los 5 tests siguiendo exactamente el mismo patrón del test
existente (`rejects catalog:createDepartment when the active session role is
usuario`): `IpcMain` falso + `createSessionStore` real + `login('usuario')` +
`expect(() => handler(...)).toThrow()`.

Para `updateProduct`/`deleteProduct` (necesitan un producto existente) se
usó una segunda llamada al mismo `session` logueado como `administrador`
para crear el producto primero, y luego `session.login('usuario')` (mismo
`SessionStore`, mismos handlers ya registrados) para probar el rechazo — sin
necesidad de dos registros de IPC.

**Verificación adversarial explícita (pedida por el usuario: "deben poder
fallar si alguien quita el guard, no deben ser tautológicos")**: se comentó
temporalmente la línea `assertRole(session.getRole(), 'administrador')` en
los 5 handlers correspondientes de `src/main/ipc/catalog.ts`, se corrió
`npx vitest run src/main/ipc/catalog.test.ts` y se confirmó que los 5 tests
nuevos fallaban (`AssertionError: expected [Function] to throw an error`)
mientras los 3 tests preexistentes seguían pasando — esto prueba que cada
test depende realmente de la línea `assertRole`, no de un efecto secundario
(p. ej. un ID inexistente que ya lanzara por otra razón). Se restauró el
guard inmediatamente después y se confirmó 8/8 verde de nuevo. `git diff` en
`catalog.ts` quedó vacío tras la restauración (confirmado) — el archivo de
producción no cambió, solo se agregaron tests.

Los IDs usados son reales (departamento `1`, sembrado por la migración
`3:seed_departments`; producto creado en el propio test) para que la
operación SÍ tuviera éxito sin el guard — de lo contrario un ID inventado
podría lanzar por una razón no relacionada (fila inexistente) y el test
sería tautológico.

## 2. Acción "Editar" en `Productos.tsx`

Se reutilizó el mismo formulario de "Crear" (mismos inputs: nombre, precio,
costo, departamento, código de barras) en vez de introducir un patrón nuevo,
tal como pidió el usuario explícitamente ("no inventes un patrón nuevo").
Diferencia deliberada con `Departamentos.tsx` (que usa `window.prompt` para
un solo campo, nombre): `Productos.tsx` edita 5 campos, así que precargar el
formulario existente es la opción correcta — un `window.prompt` por campo
habría sido peor UX y no era lo que pedía el usuario.

Cambios:
- `editingId: number | null` (nuevo estado) distingue modo Crear (`null`) de
  modo Editar (id del producto).
- `toFormState(product)` convierte un `Product` (tipos numéricos/`null`) al
  `ProductFormState` (todo `string`, igual que los inputs controlados).
- `handleEdit(product)` precarga el formulario y fija `editingId`.
- `handleSave()` (antes `handleCreate()`) llama `updateProduct(editingId,
  ...)` si `editingId !== null`, si no `createProduct(...)` — mismo
  `buildInput()` extraído para no duplicar el parseo de strings a los tipos
  de `ProductInput`.
- Botón "Cancelar" (solo visible en modo Editar) limpia el formulario sin
  guardar. El texto del botón de submit cambia a "Guardar cambios" en modo
  Editar.
- `handleDelete` sale de modo Editar si el producto eliminado era el que se
  estaba editando (evita enviar un `updateProduct` a un id ya borrado).

No se agregó ningún test automatizado para este cambio de UI — sigue el
mismo precedente ya documentado y justificado en PR1 y PR2 ("Testing scope
decision" arriba): no hay `@testing-library/react` ni ninguna librería de
component-testing en el proyecto (`vitest.config.ts` usa `environment:
'node'`, `package.json` no tiene `jsdom` ni testing-library), `design.md`
"Testing Strategy" no define una capa de component-testing, y agregar
tooling nuevo solo para esta pantalla habría sido freelancing no solicitado.
La lógica de negocio que respalda "Editar" (`updateProduct` en
`db/queries/products.ts`, incluyendo la reasignación de departamento) ya
tenía TDD completo desde PR2 (`products.test.ts`); este follow-up solo
conecta la UI a código ya probado.

## TDD Cycle Evidence (PR2 follow-up)

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Guard IPC: `updateDepartment`/`deleteDepartment`/`createProduct`/`updateProduct`/`deleteProduct` | `src/main/ipc/catalog.test.ts` | Integration (IpcMain falso, sin Electron real) | ✅ 54/54 antes de tocar el archivo | ✅ Escritos referenciando canales ya cableados (comportamiento correcto ya existía) | ✅ 8/8 en `catalog.test.ts` (3 preexistentes + 5 nuevos) | ✅ No aplica triangulación clásica (cada test cubre un canal distinto, no variantes del mismo comportamiento) — en su lugar se hizo verificación adversarial: guard comentado → 5/5 nuevos en RED real, guard restaurado → 8/8 GREEN de nuevo (ver detalle arriba) | ➖ None needed (mismo patrón ya limpio, sin duplicación nueva) |
| UI "Editar" en `Productos.tsx` | N/A (sin capa de component-testing en el proyecto, ver justificación arriba) | N/A | N/A | N/A | N/A (verificado por `npm run build` + `npm run typecheck`, ambos limpios) | N/A | ✅ `buildInput()` extraído para no duplicar el parseo entre Crear/Editar |

### Test Summary (PR2 follow-up)

- **Total tests written**: 5
- **Total tests passing**: 59/59 (proyecto completo, `npx vitest run`: 54 previos + 5 nuevos)
- **Layers used**: Integration (wiring IPC, `IpcMain` falso) — 5
- **Approval tests**: 0 (no hubo refactor de comportamiento existente)
- **Pure functions created**: 0 nuevas en producción (`assertRole` ya existía; el follow-up solo agrega cobertura y UI)

## Comandos verificados (todos pasan)

```
npx vitest run src/main/ipc/catalog.test.ts → 8/8 (antes del follow-up: 3/3)
npx vitest run                              → 59/59 (11 archivos)
npm run typecheck                           → tsc --noEmit limpio (node + web)
npm run build                               → typecheck + electron-vite build OK
```

## Status (PR2 follow-up)

Ambos hallazgos WARNING accionables de `verify-report-pr2.md` (1 y 2)
resueltos. El WARNING 3 (housekeeping de `state.yaml`) también se resolvió
actualizando `pr_plan[PR2].followup` y `phases.apply.current_pr`. Sin cambios
en Fases 5-11. Listo para que el usuario decida si re-verificar este
follow-up puntual o continuar directo con PR3 (Fases 5-6, Ventas + Caja).

---

# PR3 (Fases 5-6): Ventas + Caja

## Scope de este PR

Solo Fase 5 (Ventas) y Fase 6 (Caja), por plan de 5 PRs encadenados
(`tasks.md` → Review Workload Forecast → Suggested Work Units → Unit 3).
Fases 7-11 quedan explícitamente fuera — ver "Pendiente para PR4" abajo. NO
se tocó ningún archivo de `src/main/printing/`, créditos completos
(`credit:grant`/`credit:pay`/`credit:balance`) ni corte del día.

## Estado: 17/18 tareas de Fase 5+6 completas (9/10 + 8/8)

Tarea 5.10 ("Wire sale-close success to ticket printing IPC") queda
explícitamente sin marcar: depende de `printing/ticket-template.ts` y
`printing/print.ts` (Fase 9, PR4), que no existen todavía en este PR. No es
un hallazgo, es una dependencia de fase declarada desde `tasks.md`.

## Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Guard de Ventas/Caja: rol requerido | `assertAuthenticated(session.getRole())` (nueva función en `auth/session.ts`) — NO `assertRole(role, 'administrador')` | El usuario pidió explícitamente "cualquier rol autenticado puede vender, no solo admin", y lo mismo aplica a operar caja (ninguna spec de `cash-register` restringe por rol). `assertAuthenticated` solo exige que exista una sesión activa (rechaza `null`), sin importar cuál de los 2 roles sea — distinto de `assertRole`, que exige coincidencia exacta con un rol especifico. |
| Matemática de venta compartida | Nuevo módulo `src/shared/sale-math.ts` (`computeSaleTotal`, `paymentsMatchTotal`, `sumPaymentAmounts`) importado TANTO por `db/queries/sales.ts` (main) COMO por `Ventas.tsx`/`SplitPaymentModal.tsx` (renderer) | Evita reimplementar la fórmula de total/validación de suma de pagos dos veces (una en el backend real que valida, otra en el frontend que solo pre-valida para UX). Es la misma justificación que ya motivó `shared/ipc-types.ts` en PR2 (Decision 2 de design.md) — aquí se extiende a lógica pura, no solo tipos. Es 100% testeable sin Electron/DOM (11 tests unitarios, cero mocks). |
| Snapshot de producto para `sales:create` | Nueva función `getProductById(db, id)` en `products.ts`, filtrando `active = 1` | `sale_lines` necesita el precio/costo/departamento del producto AL MOMENTO de la venta (design.md Decision 7). Un producto soft-eliminado no MUST poder venderse — se reusa el mismo criterio de `findByBarcode` (que ya filtraba `active = 1`). |
| Selector de cliente para pago a crédito | `customers:list` (IPC sin guard, solo lectura) + `<select>` en `SplitPaymentModal.tsx` listando clientes YA CAPTURADOS. **NO se implementó "crear cliente nuevo" en este PR.** | Instrucción explícita del usuario: "si no hay UI de clientes todavía, un selector simple por ID o nombre ya capturado basta, documenta la limitación". `customer-credit/spec.md` "Registrar cliente nuevo al otorgar crédito" pertenece a `credit:grant` (tasks.md 7.1, Fase 7/PR4) — implementarlo aquí habría sido adelantar alcance de otro PR sin que el usuario lo pidiera. **Limitación documentada**: mientras no exista ningún cliente en `customers` (tabla vacía hasta que alguien la llene manualmente o hasta PR4), la porción `credito` es inutilizable desde la UI — el backend (`sales:create` + `validateSalePayments`) sigue rechazando correctamente una porción `credito` sin `customerId`, y el modal muestra un aviso explícito ("No hay clientes registrados todavía...") en ese caso, en vez de fallar en silencio. |
| Mapeo `Role` → `roles.id` | Nueva función `getRoleId(db, role)` en `db/queries/roles.ts` | Documentado como pendiente explícito en el "Pendiente para PR3" de PR2 ("falta mapear Role a roles.id"). Necesario para las FK `shifts.opened_by_role_id`/`closed_by_role_id`. Usada por `ipc/cash.ts` en `openShift`/`closeShift`. |
| Un solo componente `Caja.tsx` (no 3 pantallas separadas) | Apertura + Entradas/Salidas + Cierre como secciones de un mismo archivo | `design.md` "Estructura de Carpetas" lista literalmente `screens/ # login, ventas, catalogo, caja, creditos, corte-dia` — una sola pantalla "caja", no tres. `tasks.md` 6.6/6.7/6.8 se leen como 3 sub-funcionalidades de esa pantalla, mismo criterio que `Productos.tsx` ya usó para crear+editar en un solo archivo (PR2 follow-up). |
| Escáner USB-HID: listener a nivel de documento + guard de foco | `document.addEventListener('keydown', ...)` en `Ventas.tsx`, ignorando el evento si `document.activeElement`/`event.target` es `INPUT`/`TEXTAREA`/`SELECT` | `design.md` "Escáner USB-HID" pide explícitamente un listener a nivel de documento (no un campo de texto aislado), pero `sales-transactions/spec.md` describe "un campo de texto con foco". Sin el guard de foco, cualquier tecleo en el buscador por nombre o en el modal de pago dividido alimentaría el buffer del escáner y rompería la escritura normal. La heurística (`isBarcodeScan`, gap < 50ms entre teclas) queda en un módulo puro separado (`screens/barcode-scanner.ts`) para poder probarla con timestamps sintéticos, sin simular eventos de teclado reales ni temporizadores. |
| Reconciliación de caja: no se persiste la "diferencia" en una columna nueva | `closeShift` guarda solo `closing_cash_counted`; la diferencia (`countedCash - expectedCash`) se calcula y se devuelve en la respuesta del IPC, no se agrega una columna `difference` al esquema | El "dinero esperado" es 100% derivable en cualquier momento a partir de datos ya persistidos (`opening_cash` + `cash_movements` + `sale_payments` del turno) — guardar una columna redundante duplicaría una fórmula ya expresada en `computeExpectedCash`. `cash-register/spec.md` "Cash Reconciliation at Close" solo exige "mostrar la diferencia" y "dejar constancia" del cierre (que sí queda: `closing_cash_counted` + `status='closed'`), no exige una columna de diferencia explícita. |

## Deviations from Design

Ninguna deviation de esquema en este PR — el esquema de PR1 ya soportaba
`sale_payments.method IN ('efectivo','tarjeta','credito')` +
`sale_payments.customer_id` y `cash_movements.provider` (deviations
documentadas en PR1, anticipando exactamente esta Fase 5/6). Las únicas
deviations son de **estructura de archivos**, documentadas en la tabla de
Decisiones arriba:

1. Nuevo módulo `src/shared/sale-math.ts` (no está en el árbol de
   `design.md`, mismo criterio que `src/shared/ipc-types.ts` de PR2).
2. `Caja.tsx` es un solo archivo, no tres pantallas separadas (design.md
   solo lista una pantalla "caja" en su estructura de carpetas — es
   consistente, no una deviation real, solo se documenta por claridad).
3. Deviation de test runner ya documentada en PR1/PR2 se repite aquí:
   `tasks.md` 5.4/6.4 dicen `node:test`; se usó `vitest` (mismo criterio,
   `openspec/config.yaml` fija `npx vitest run`).

## Limitaciones documentadas (alcance explícito de este PR)

1. **Selector de cliente para pago a crédito es de solo lectura de
   clientes ya existentes.** No hay forma de crear un cliente nuevo desde
   la pantalla de Ventas en este PR — eso es `credit:grant` (Fase 7/PR4).
   Si la tabla `customers` está vacía, una porción `credito` no se puede
   completar desde la UI (el backend la sigue rechazando correctamente).
2. **La porción `credito` de una venta NO otorga crédito real todavía.**
   `sales:create` inserta la fila en `sale_payments` con
   `method='credito'` y el `customer_id` elegido, pero NO inserta en
   `customer_credits` — esa tabla y su lógica de saldo pertenecen a
   `credit:grant` (Fase 7/PR4, según el diagrama de secuencia de
   design.md "Crédito de cliente", que muestra un `invoke('credit:grant',
   ...)` SEPARADO después de la venta). El renderer de este PR no dispara
   ese segundo `invoke` porque el handler no existe aún.
3. **Tarea 5.10 (imprimir ticket al cerrar venta) no implementada.**
   Depende de `printing/ticket-template.ts`/`print.ts` (Fase 9, PR4).
4. **No hay listado histórico de ventas ni de turnos cerrados en la UI.**
   Solo se muestra el turno actualmente abierto y sus movimientos; ver
   ventas/turnos pasados requiere el Corte del Día (Fase 8, PR4).

## Archivos creados

| Archivo | Qué hace |
|---|---|
| `src/shared/sale-math.ts` + `.test.ts` | Matemática pura de venta compartida main/renderer: `computeLineTotal`, `computeSaleTotal`, `sumPaymentAmounts`, `paymentsMatchTotal` |
| `src/main/db/queries/sales.ts` + `.test.ts` | `validateSaleLines`, `validateSalePayments` (puras), `createSale` (transaccional, snapshot dept/cost/price), `getSaleById` |
| `src/main/db/queries/cash.ts` + `.test.ts` | `getOpenShift`, `openShift` (bloquea doble turno), `cashIn`, `cashOut` (+ `validateCashOutInput` pura), `listCashMovements`, `computeExpectedCash` (pura), `closeShift` |
| `src/main/db/queries/customers.ts` + `.test.ts` | `listCustomers` (solo lectura, selector de crédito) |
| `src/main/ipc/sales.ts` + `.test.ts` | Wiring `sales:create` con guard `assertAuthenticated` (cualquier rol) |
| `src/main/ipc/cash.ts` + `.test.ts` | Wiring `cash:getOpenShift/openShift/cashIn/cashOut/listMovements/closeShift` |
| `src/main/ipc/customers.ts` + `.test.ts` | Wiring `customers:list` (sin guard) |
| `src/renderer/screens/barcode-scanner.ts` + `.test.ts` | Heurística pura del escáner USB-HID (`isBarcodeScan`, `bufferToBarcode`) |
| `src/renderer/screens/Ventas.tsx` | Pantalla de Ventas: búsqueda por nombre, escáner (listener de documento + guard de foco), líneas con cantidad/subtotal/total, modal de pago dividido |
| `src/renderer/screens/Caja.tsx` | Pantalla de Caja: apertura de turno, entradas/salidas, cierre con esperado/contado/diferencia |
| `src/renderer/components/SplitPaymentModal.tsx` | Modal de pago dividido reusable: porciones efectivo/tarjeta/crédito, selector de cliente para crédito, validación de suma en tiempo real |

## Archivos modificados

| Archivo | Qué cambia |
|---|---|
| `src/main/auth/session.ts` + `.test.ts` | Nueva función `assertAuthenticated` (guard de "cualquier rol autenticado") |
| `src/main/db/queries/roles.ts` + `.test.ts` | Nueva función `getRoleId` (mapea `Role` string → `roles.id` INTEGER) |
| `src/main/db/queries/products.ts` + `.test.ts` | Nueva función `getProductById` (snapshot de venta) |
| `src/shared/ipc-types.ts` | Agrega tipos `Customer`, `Shift`, `CashMovement`, `Sale*`, `CloseShiftResult`, `SalesApi`, `CashApi`, `CustomersApi`; extiende `PosApi` |
| `src/main/preload.ts` | Expone `sales.*`, `cash.*`, `customers.*` vía `contextBridge` |
| `src/main/index.ts` | Registra `registerSalesIpc`/`registerCashIpc`/`registerCustomersIpc` en `app.whenReady()` |
| `src/renderer/App.tsx` | Agrega navegación a "Ventas"/"Caja" (visibles para AMBOS roles, a diferencia de Departamentos/Productos que siguen Admin-only) |

## Verificación adversarial de los guards IPC (obligatoria, mismo criterio que PR2 follow-up)

Se repitió explícitamente el experimento pedido por el usuario en el
follow-up de PR2 ("deben poder fallar si alguien quita el guard, no deben
ser tautológicos") para los 2 handlers nuevos con guard
(`sales:create`, `cash:openShift`/`cash:cashOut`):

1. **Primer intento con `sales:create` reveló un test tautológico real**:
   la prueba original de "rechaza sin sesión" usaba una venta VACÍA
   (`lines: []`) — al comentar `assertAuthenticated`, el test seguía
   "pasando" (3/3 verde) porque `validateSaleLines` rechaza la venta vacía
   por SU CUENTA, sin necesidad del guard. Se corrigió usando una venta
   VÁLIDA (turno real, producto real, pago que sí suma el total) que de
   otro modo tendría éxito — con esa corrección, remover el guard sí hizo
   fallar el test (1/3 rojo), confirmando que la aserción depende
   realmente de `assertAuthenticated`. Guard restaurado, 3/3 verde de
   nuevo.
2. **Mismo hallazgo en `cash.test.ts`, en 2 de los 3 handlers guardados**:
   - `cash:openShift` con `role=null`: `getRoleId(db, null)` YA lanza por
     su cuenta ("Rol desconocido: null") sin necesidad del guard —
     tautológico con un `toThrow()` genérico. Se corrigió exigiendo el
     mensaje EXACTO de `assertAuthenticated` (`/sesion activa/`), distinto
     del mensaje de `getRoleId` — así, si se borra el guard, el handler
     sigue lanzando pero con OTRO mensaje y la aserción específica falla.
   - `cash:cashOut` con un `shiftId` inventado: la FK de
     `cash_movements.shift_id` ya lanza por su cuenta sin el guard
     (`enableForeignKeyConstraints: true`) — tautológico. Se corrigió
     insertando un turno REAL directo por SQL (sin pasar por
     `openShift`/sesión) con `concept`/`provider` válidos, de modo que sin
     el guard la operación tendría éxito real (no lanzaría nada). Con esa
     corrección, remover el guard hace fallar el test con
     `AssertionError: expected [Function] to throw an error` (falla
     limpia, no solo "mensaje distinto").
   - Verificado con los 5 handlers guardados de `cash.ts` comentados
     simultáneamente: las 5 pruebas de `cash.test.ts` seguían en verde
     ANTES de corregir los 2 tests anteriores (confirma el problema);
     después de corregirlos, remover los 3 guards hace fallar
     específicamente esos 2 tests (los otros 3 — `getOpenShift` sin
     guard, `openShift`/`closeShift` con sesión válida — no dependen del
     guard y siguen en verde, como se espera).
   - Guards restaurados en ambos archivos, 5/5 y 3/3 verde de nuevo
     respectivamente; `git diff` de `sales.ts`/`cash.ts` quedó limpio tras
     restaurar (sin cambios de producción, solo se corrigieron los
     tests).

Este hallazgo queda documentado explícitamente porque es exactamente el
tipo de falso positivo que Strict TDD Mode busca prevenir (Banned
Assertion Patterns: "would FAIL if the production code were wrong") — un
`toThrow()` sin verificar la CAUSA del throw puede pasar por razones
completamente ajenas al comportamiento que se pretende probar.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Base para 5.3/6.4 | `src/shared/sale-math.test.ts` | Unit (puro) | N/A (new) | ✅ Written | ✅ Passed | ✅ 11 casos (multiplicación, suma multi-línea, split-payment exacto/insuficiente, tolerancia de flotantes) | ➖ None needed |
| Guard Fase 5/6 | `src/main/auth/session.test.ts` (existente) | Unit | ✅ 9/9 antes de agregar `assertAuthenticated` | ✅ Written (referenciaba función inexistente) | ✅ Passed | ✅ 3 casos (usuario, administrador, null) | ➖ None needed |
| FK `shifts.opened_by_role_id` | `src/main/db/queries/roles.test.ts` (existente) | Integration (`:memory:` real) | ✅ 3/3 antes de agregar `getRoleId` | ✅ Written | ✅ Passed | ✅ 3 casos (usuario, administrador distinto, rol inexistente) | ➖ None needed |
| Snapshot de venta | `src/main/db/queries/products.test.ts` (existente) | Integration (`:memory:` real) | ✅ 11/11 antes de agregar `getProductById` | ✅ Written | ✅ Passed | ✅ 3 casos (activo, soft-eliminado, id inexistente) | ➖ None needed |
| Selector de crédito | `src/main/db/queries/customers.test.ts` | Integration (`:memory:` real) | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 casos (vacío, listar activos ordenados, excluir inactivos) | ➖ None needed |
| 5.2/5.3 (validaciones puras) | `src/main/db/queries/sales.test.ts` | Unit (puro) | N/A (new) | ✅ Written | ✅ Passed | ✅ 9 casos (líneas vacías/cantidad 0/negativa/válida, pagos insuficientes/exactos/split/crédito sin-con cliente) | ➖ None needed |
| 5.1/5.4/5.5 (`createSale`) | `src/main/db/queries/sales.test.ts` | Integration (`:memory:` real, sin mocks) | N/A (new) | ✅ Written | ✅ Passed | ✅ 10 casos (venta vacía, sin turno abierto, pagos no suman, crédito sin cliente, venta simple, multi-línea, split efectivo+tarjeta, crédito con cliente, rollback por producto inexistente, `getSaleById`) | ➖ None needed |
| 6.1/6.4/6.5 (`openShift`/doble turno) | `src/main/db/queries/cash.test.ts` | Integration (`:memory:` real) | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 casos (abrir, rechazar segundo turno, reabrir tras cerrar) | ➖ None needed |
| 6.2 (`cashIn`/`cashOut`) | `src/main/db/queries/cash.test.ts` | Unit (`validateCashOutInput` puro) + Integration | N/A (new) | ✅ Written | ✅ Passed | ✅ 8 casos (entrada válida/sin motivo, salida válida/sin motivo/sin proveedor/con ambos faltantes, listado en orden) | ➖ None needed |
| 6.3/6.4 (`closeShift`/reconciliación) | `src/main/db/queries/cash.test.ts` | Unit (`computeExpectedCash` puro) + Integration | N/A (new) | ✅ Written | ✅ Passed | ✅ 5 casos (fórmula design.md $500+$200=$700, fórmula tasks.md 6.4 $700+$900-$300=$1,300, cierre sin diferencia, cierre con faltante -$50, expected recalculado desde ventas reales en efectivo) | ➖ None needed |
| Guard `sales:create` | `src/main/ipc/sales.test.ts` | Integration (`IpcMain` falso) | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 casos (rechazado sin sesión — CORREGIDO tras hallazgo adversarial, permitido usuario, permitido administrador) | ➖ None needed |
| Guard `cash:*` | `src/main/ipc/cash.test.ts` | Integration (`IpcMain` falso) | N/A (new) | ✅ Written | ✅ Passed | ✅ 5 casos (openShift sin sesión — CORREGIDO, openShift con sesión, getOpenShift sin guard, cashOut sin sesión — CORREGIDO, closeShift end-to-end) | ➖ None needed |
| Wiring `customers:list` | `src/main/ipc/customers.test.ts` | Integration (`IpcMain` falso) | N/A (new) | ✅ Written | ✅ Passed | ➖ Single (un solo canal, sin guard, sin variantes de comportamiento que triangular) | ➖ None needed |
| Escáner USB-HID | `src/renderer/screens/barcode-scanner.test.ts` | Unit (puro) | N/A (new) | ✅ Written | ✅ Passed | ✅ 6 casos (gaps consistentes <50ms, gap >=50ms, una sola tecla, buffer vacío, join de buffer, buffer vacío a string) | ➖ None needed |

### Test Summary

- **Total tests written (PR3)**: 76 (11 sale-math + 3 session + 3 roles + 3 products + 3 customers + 19 sales + 19 cash + 3 ipc/sales + 5 ipc/cash + 1 ipc/customers + 6 barcode-scanner)
- **Total tests passing (PR3)**: 76/76
- **Total tests passing (proyecto completo, PR1+PR2+PR3)**: 135/135 (`npx vitest run`, 19 archivos)
- **Layers used**: Unit (sale-math, session, validateSaleLines/validateSalePayments, validateCashOutInput, computeExpectedCash, barcode-scanner — todas puras), Integration (sales/cash/customers/roles/products contra `node:sqlite` real, sin mocks; ipc/sales, ipc/cash, ipc/customers con `IpcMain` falso)
- **Approval tests** (safety net antes de modificar archivos existentes): 4 — `session.test.ts` (9/9), `roles.test.ts` (3/3), `products.test.ts` (11/11), `cash.test.ts` completo (5/5) reverificado tras cada corrección adversarial
- **Pure functions created**: `computeLineTotal`, `computeSaleTotal`, `sumPaymentAmounts`, `paymentsMatchTotal`, `assertAuthenticated`, `validateSaleLines`, `validateSalePayments`, `validateCashOutInput`, `computeExpectedCash`, `isBarcodeScan`, `bufferToBarcode` (11)
- **Mocks usados**: 0 mocks de librerías/módulos externos. Único "doble de prueba": `IpcMain` falso en `ipc/*.test.ts` (mismo patrón que PR2, implementa solo `.handle`)
- **Hallazgos adversariales corregidos**: 3 tests tautológicos detectados y corregidos (ver sección dedicada arriba) — 1 en `ipc/sales.test.ts`, 2 en `ipc/cash.test.ts`

## Comandos verificados (todos pasan)

```
npx vitest run    → 19 files, 135/135 tests passed
npm run typecheck  → tsc --noEmit limpio (node + web)
npm run build      → typecheck + electron-vite build OK (renderer bundle 671KB)
npm run dev        → main+preload build OK, renderer sirve en localhost:5173,
                     proceso Electron arranca (unicos mensajes en stderr:
                     "Network service crashed"/"GPU process exited", mismo
                     patron de sandbox ya documentado en PR1/PR2, no son
                     errores de la aplicacion)
```

## Pendiente para PR4 (Fases 7-9, NO implementado en este PR)

- **Fase 7 — Créditos de Clientes**: `credit:grant` (crear cliente si es
  nuevo, insertar `customer_credits` — el diagrama de secuencia de
  design.md muestra esto como un `invoke` SEPARADO después de
  `sales:create`, no integrado en él), `credit:pay` (con clamp/rechazo si
  excede el saldo), `credit:balance`, y la UI real de "crear cliente nuevo"
  que el selector simplificado de este PR (`customers:list`, solo lectura)
  no cubre. El picker de `SplitPaymentModal.tsx` deberá actualizarse para
  ofrecer "crear cliente nuevo" inline una vez exista `credit:grant`.
- **Fase 8 — Corte del Día**: `reports:dailyCut` (9 secciones por
  `shift_id`), incluyendo la advertencia de "productos sin costo" en
  Ganancia del Día y el literal "NO HUBO PAGOS" cuando no hay pagos de
  crédito. Las queries de agregación de `cash.ts` (`getShiftCashSummary`,
  no exportada) ya cubren 3 de las 9 secciones (entradas, salidas, ventas en
  efectivo) y pueden reusarse o servir de referencia de patrón.
- **Fase 9 — Impresión de Tickets**: `printing/ticket-template.ts` +
  `printing/print.ts` + IPC `print:sale`/`print:dailyCut`. La tarea 5.10 de
  este PR (wire sale-close → impresión) queda pendiente hasta que esto
  exista — `Ventas.tsx` ya tiene el punto de integración natural
  (`handleConfirmPayment`, justo después de `setLastSale(sale)`).
- Ningún archivo de `src/main/printing/` tiene contenido real todavía —
  sigue solo con `.gitkeep`.
- La tabla `customers` sigue vacía hasta que Fase 7 implemente
  `credit:grant` o alguien inserte clientes manualmente — ver "Limitaciones
  documentadas" arriba.

## Status (PR3)

17/18 tasks (Fase 5: 9/10, Fase 6: 8/8) completas. 45/46 tasks totales
(Fase 1-6) del cambio `pos-inicial`. Listo para `sdd-verify` de este work
unit, o para continuar directo con PR4 (Fases 7-9, Créditos + Corte del Día
+ Impresión) según la estrategia de entrega del usuario.

---

# PR3 fix: tolerancia de centavos

## Scope de este fix

Corrección puntual de un hallazgo **CRITICAL** de `verify-report-pr3.md`
(verificación independiente), antes de iniciar PR4. NO es un PR nuevo del
plan de 5 — es un fix de bajo riesgo sobre `src/shared/sale-math.ts` que
PR4 necesita como base correcta antes de construir crédito (Fase 7) y corte
del día (Fase 8) sobre el mismo módulo de matemática de dinero.

## El bug

`AMOUNT_EPSILON = 0.01` (un centavo completo) en `paymentsMatchTotal`
permitía que una venta con pago dividido cerrara aunque faltara hasta $0.01
real. Ejemplo confirmado por el verificador ejecutando la función
directamente:

```
paymentsMatchTotal([{amount: 33.32}], 33.33)  -> true (debía ser false)
paymentsMatchTotal([{amount: 199.99}], 200)   -> true (debía ser false)
```

Esto viola literalmente `sales-transactions/spec.md` ("Split Payment per
Sale": "La suma de las porciones MUST ser igual al total... el sistema
MUST rechazar el cierre si la suma no coincide"). El ruido REAL de punto
flotante en estos cálculos es del orden de 1e-13 a 1e-15 (confirmado con
`$11.11 x3 = $33.33`, diferencia real ~5e-15) — un centavo completo de
tolerancia no es "ruido de flotantes", es un descuento real no autorizado.

Causa raíz adicional (mencionada por el verificador): `computeLineTotal`
no redondeaba a centavos, así que un producto vendido por peso (cantidad
fraccionaria, ej. 0.733 kg) podía persistir un `line_total` con más de 2
decimales de precisión monetaria real (ej. 62.6715) en `sale_lines`. El
epsilon de 1 centavo probablemente compensaba ese problema por accidente
en vez de resolverlo con redondeo explícito.

## La corrección

1. **`AMOUNT_EPSILON` reducido de `0.01` a `0.005`** (medio centavo) en
   `src/shared/sale-math.ts`. Justificación en el comentario del código:
   medio centavo cubre con margen generoso el ruido real de flotantes
   (~1e-13) y el residual de sumar varias `line_total` ya redondeadas,
   sin llegar nunca a absorber un faltante real (siempre >= 1 centavo =
   0.01, muy por encima de 0.005).
2. **Redondeo explícito a centavos en dos puntos**:
   - `computeLineTotal` (`src/shared/sale-math.ts`): redondea
     `quantity * unitPrice` a centavos con `Math.round(x * 100) / 100`.
     Este es el punto de cálculo real usado tanto por la validación pura
     como por `createSale` (`src/main/db/queries/sales.ts`) al insertar
     `sale_lines.line_total` — se corrigió `sales.ts` para reusar
     `computeLineTotal` en vez de recalcular `line.quantity * product.price`
     sin redondear (bug de duplicación de lógica, mismo hallazgo).
   - `computeSaleTotal`: redondea el resultado final de la suma, como
     defensa adicional contra el residual de punto flotante de sumar
     varios floats de 2 decimales (mismo fenómeno que `0.1 + 0.2`).
   - Decisión: se redondea en AMBOS puntos (línea y suma), no solo al
     validar el total contra los pagos — porque `line_total` se persiste
     tal cual en la base de datos (consultable después, ej. reportes de
     Fase 8), así que el valor persistido también debe estar en centavos
     reales, no solo el valor usado para comparar en memoria.
3. **Revisión de reutilización del mismo patrón** (punto 4 del fix):
   `src/main/db/queries/cash.ts` (`computeExpectedCash`, conciliación de
   caja) NO usa ningún epsilon ni comparación de tolerancia — calcula la
   diferencia exacta (`countedCash - expectedCash`) y la persiste/muestra
   tal cual, sin rechazar el cierre por diferencia (comportamiento
   correcto y ya verificado en PR3, spec permite cierre con faltante). No
   se encontró otro lugar del código con el mismo patrón de tolerancia.
   `SplitPaymentModal.tsx` reutiliza `paymentsMatchTotal` del módulo
   compartido (no duplica la lógica), así que se beneficia del fix
   automáticamente sin cambios propios.

## Evidencia TDD (RED → GREEN)

### TDD Cycle Evidence

| Comportamiento | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| `paymentsMatchTotal` rechaza faltante de 1 centavo | `src/shared/sale-math.test.ts` | Unit | ✅ 12/12 (tests previos de sale-math) | ✅ Escrito (`$33.32 vs $33.33` y `$199.99 vs $200` fallaban con epsilon=0.01) | ✅ Pasa tras reducir `AMOUNT_EPSILON` a 0.005 | ✅ 4 casos (shortfall $33.32, shortfall $199.99, split legítimo 3x$11.11, ruido $0.1+$0.2 ya existente) | ➖ None needed (constante + fórmula ya simples) |
| `computeLineTotal` redondea a centavos (peso fraccionario) | `src/shared/sale-math.test.ts` | Unit | ✅ 12/12 | ✅ Escrito (0.733kg x $85.50/$85.55 fallaban sin redondeo) | ✅ Pasa tras agregar `roundToCents` | ✅ 2 casos (redondeo hacia abajo 62.6715→62.67, redondeo hacia arriba 62.70815→62.71) | ➖ None needed |
| `createSale` persiste `line_total` redondeado (integración real) | `src/main/db/queries/sales.test.ts` | Integration (`node:sqlite` real) | ✅ 19/19 (tests previos de sales.test.ts) | ✅ Escrito (0.733kg x $85.55 → esperaba 62.71, código actual daba 62.708149999999996) | ✅ Pasa tras reusar `computeLineTotal` en `sales.ts` en vez de multiplicación cruda | ➖ Single (un solo caso de integración basta — la lógica de redondeo ya está triangulada a nivel unit en `sale-math.test.ts`; este test solo prueba el wiring real) | ➖ None needed |

### Test Summary

- **Total tests nuevos**: 6 (5 en `sale-math.test.ts` + 1 en `sales.test.ts`)
- **Total tests pasando (antes del fix, baseline/safety net)**: 135/135
- **Total tests pasando (después del fix)**: 141/141 (`npx vitest run`, 19 archivos)
- **Layers used**: Unit (5, sale-math puro), Integration (1, `node:sqlite` real vía `createSale`)
- **Approval tests**: N/A — no fue un refactor de comportamiento existente sin tests, fue una corrección de bug con tests nuevos que fallan contra el código viejo (RED real) y pasan contra el código corregido (GREEN real)
- **Pure functions modificadas**: `computeLineTotal`, `computeSaleTotal`, `paymentsMatchTotal` (constante `AMOUNT_EPSILON`); función privada nueva `roundToCents`
- **Mocks usados**: 0

## Comandos verificados (todos pasan)

```
npx vitest run     → 19 files, 141/141 tests passed (135 previos + 6 nuevos)
npm run typecheck  → tsc --noEmit limpio (node + web)
npm run build      → typecheck + electron-vite build OK (renderer bundle 671.16KB)
```

## Archivos modificados

| Archivo | Qué cambió |
|---|---|
| `src/shared/sale-math.ts` | `AMOUNT_EPSILON` 0.01 → 0.005 (con justificación en comentario); `computeLineTotal` y `computeSaleTotal` ahora redondean a centavos vía `roundToCents` (función privada nueva) |
| `src/shared/sale-math.test.ts` | +5 tests: 2 de redondeo de `computeLineTotal` (peso fraccionario, redondeo arriba/abajo), 3 de `paymentsMatchTotal` (2 shortfalls de 1 centavo que ahora se rechazan, 1 split legítimo 3x$11.11 que sigue aceptándose) |
| `src/main/db/queries/sales.ts` | `createSale` ahora reusa `computeLineTotal` de `shared/sale-math.ts` para calcular `line_total` en vez de `line.quantity * product.price` sin redondear |
| `src/main/db/queries/sales.test.ts` | +1 test de integración: `line_total` redondeado a centavos para cantidad fraccionaria, verificado contra SQLite real |

## Deviations from Design

Ninguna — es una corrección de bug dentro del mismo módulo (`sale-math.ts`)
y del mismo criterio ya establecido en `design.md` (matemática de dinero
compartida entre main/renderer), no un cambio de arquitectura.

## Status (PR3 fix)

Fix completo. 141/141 tests pasan (135 previos + 6 nuevos), build y
typecheck limpios. El hallazgo CRITICAL de `verify-report-pr3.md` queda
resuelto. Listo para iniciar PR4 (Fases 7-9) sobre una base de matemática
de dinero corregida.

---

# PR4 (Fases 7-9): Créditos de Clientes + Corte del Día + Impresión

## Scope de este PR

Fase 7 (Créditos de Clientes), Fase 8 (Corte del Día) y Fase 9 (Impresión de
Tickets) completas, por plan de 5 PRs encadenados (`tasks.md` → Review
Workload Forecast → Suggested Work Units → Unit 4). Fases 10-11
(empaquetado/CI + validación en sitio) quedan explícitamente fuera — ver
"Pendiente para PR5" abajo. También se cerró la tarea 5.10, diferida desde
PR3 por depender de esta Fase 9.

## Estado: 20/20 tareas de Fase 7+8+9 completas (7/7 + 7/7 + 6/6), + 5.10 cerrada

Las 3 fases se completaron enteras con TDD completo — no fue necesario
recortar alcance (la instrucción de priorizar Fase 7+8 sobre Fase 9 en caso
de que el trabajo no cupiera en una sola pasada no se activó).

## Decisiones tomadas

| Decisión | Elegido | Por qué |
|---|---|---|
| Cómo resolver el "backfill" de PR3 (venta a crédito no reflejada en `customer_credits`) | Dos invokes separados desde `Ventas.tsx` DESPUÉS de `sales:create`: por cada `sale_payments` con `method='credito'`, se llama `credit:grant({customerId, saleId: sale.id, shiftId, amount})` | Sigue literalmente el diagrama de secuencia "Crédito de cliente" de `design.md` (`credit:grant` como `invoke` SEPARADO). `sale_payments.customer_id` es una FK real que exige que el cliente YA EXISTA al momento de insertar la venta — por eso el cliente se resuelve ANTES de `sales:create` (ver siguiente decisión), y el saldo de crédito se escribe DESPUÉS, una vez que la venta (y por tanto el `sale_id`) ya existe. |
| "Crear cliente nuevo" durante una venta a crédito | Nuevo IPC `customers:create` (independiente de `credit:grant`), invocado desde `SplitPaymentModal.tsx`/`Ventas.tsx` ANTES de `sales:create` cuando el cajero elige "+ Nuevo cliente" y captura el nombre | Necesario por la misma restricción de FK: si se intentara resolver "cliente nuevo" DENTRO de `credit:grant` (que se llama después de la venta), `sale_payments.customer_id` se quedaría en `NULL` para esa porción y el saldo de crédito no podría asociarse correctamente a la fila de pago de la venta. Separar "crear/resolver cliente" de "otorgar crédito" en dos IPCs distintos deja cada uno con una sola responsabilidad y evita tocar `sales.ts`/`sales:create` (ya verificado en PR3) para nada de esta lógica nueva. |
| `credit:grant` también acepta `customerName` (no solo `customerId`) | `grantCredit` resuelve el cliente por id O por nombre (reusa uno existente con nombre exacto, o lo crea) | Satisface literalmente tasks.md 7.1 ("create customer if new") y customer-credit/spec.md Scenario "Registrar cliente nuevo al otorgar crédito" para el caso en que `credit:grant` se invoque de forma standalone (sin pasar por `customers:create` primero) — p. ej. si en el futuro se agrega un flujo de "otorgar crédito sin venta" desde la pantalla de Créditos. En el flujo de venta real (`Ventas.tsx`) el cliente YA llega resuelto por `customerId` vía `customers:create`, así que esta rama de `grantCredit` no se ejercita desde la UI de este PR, pero SÍ está cubierta por tests directos de `credits.test.ts`. |
| Pago de crédito mayor al saldo: **rechazar**, no limitar | `payCredit` lanza un error si `amount > balance` (con margen de `0.005` para ruido de flotantes, mismo criterio que `AMOUNT_EPSILON`) | `customer-credit/spec.md` permite CUALQUIERA de las dos ("MUST rechazar el pago O limitarlo"). Se eligió rechazar porque silenciosamente reducir el monto que el cajero tecleó podría registrar un pago distinto al efectivo real que el cliente entregó, sin que nadie lo note — mismo principio de "no silenciar montos de dinero real" que ya motivó el fix de `AMOUNT_EPSILON` en PR3 (commit `64ceb2b`). El error incluye el saldo pendiente exacto para que el cajero pueda corregir el monto. |
| Redondeo de saldos de crédito | `getCustomerBalance`/`grantCredit`/`payCredit` reusan `roundToCents` (exportado de `sale-math.ts` en este PR, antes privado) en vez de reinventar el redondeo | Instrucción explícita de la sesión ("reutiliza `src/shared/sale-math.ts`, no reinventes la comparación de montos"). Sin este redondeo, sumar/restar muchos pagos parciales de crédito a lo largo de varios turnos podría acumular residuo de punto flotante en el saldo mostrado al cajero — mismo fenómeno que ya motivó el fix de PR3. |
| "Ventas de contado" (sección 2 del Corte del Día) EXCLUYE `credito` | `sumSalePaymentsForShift(db, shiftId, ['efectivo','tarjeta'])` | **Deviation deliberada vs. `design.md`** (que sugiere `SUM(sale_payments.amount)` "todas las formas de pago", lo cual incluiría crédito). `daily-report/spec.md` (fuente de verdad RFC2119) dice literalmente "efectivo + tarjeta = total" para esta sección, contrastándola explícitamente con la sección 8 ("Pagos de créditos") — crédito otorgado no es dinero de contado recibido. Se siguió el texto literal del spec en vez del hint SQL de design.md. |
| "Ventas totales" (sección 6) = Ventas de contado + Pagos de créditos | `computeTotalSales(cashSalesTotal, creditPaymentsTotal)` | **Deviation deliberada vs. `design.md`** (que sugiere `SUM(sales.total) WHERE status='completed'`, es decir el valor de TODO lo vendido, incluyendo crédito recién otorgado como si ya fuera dinero recibido). `daily-report/spec.md` dice literalmente "ventas de contado + pagos de clientes (créditos) = total" — esto refleja la contabilidad real de una tienda chica: crédito otorgado hoy es una CUENTA POR COBRAR, no una venta "totalizada" hasta que se cobra (ese día o días después). Se verificó que esta formula es INDEPENDIENTE de "Ganancia del día" (que sí usa `sale_lines` de TODAS las ventas del turno sin importar método de pago, vía `computeProfit`) — no hay conflicto entre ambas secciones. Documentado también como comentario inline en `reports.ts`. |
| "Entradas efectivo" (sección 1) = inicio de caja + entradas de cambio | `roundToCents(shift.openingCash + cashSummary.cashInTotal)` | Confirmado cruzando `daily-report/spec.md` (formula textual "inicio de caja + entradas de cambio") contra el Scenario "Dinero en caja consistente con conciliación de caja" (`$700 + $900 - $300 = $1,300`) y el test YA EXISTENTE de PR3 (`cash.test.ts`, tasks.md 6.4, mismos números exactos) — el `$700` de ese ejemplo es la SUMA de `openingCash` + `cashInTotal`, no solo las entradas de cambio aisladas. Esto reconcilia por completo la formula del spec con `computeExpectedCash` (ya verificado en PR3): "Dinero en caja" (sección 4) es literalmente `computeExpectedCash({openingCash, cashInTotal, cashSalesTotal: efectivo-only, cashOutTotal})`, sin necesidad de ninguna formula nueva. |
| Conteo de "productos sin costo" en Ganancia del día | Cuenta productos **distintos** (`Set<productId>`), no líneas de venta | tasks.md 8.2 pide "count-of-uncosted-products" (productos, no líneas). Vender el mismo producto sin costo capturado 3 veces en el mismo turno debe advertir "1 producto sin costo", no "3" — de lo contrario la advertencia exageraría el problema real (un solo producto mal capturado en el catálogo). |
| Exportar `getShiftCashSummary`/agregar `getShiftById` en `cash.ts` (antes privado / no existía) | Cambios additivos puros en un archivo ya verificado (PR3) — safety net corrido antes y después de cada cambio, sin tocar ninguna función existente | `reports.ts` necesita EXACTAMENTE los mismos 3 agregados de caja que ya usa `closeShift` (evita reescribir las mismas 3 queries SQL) y necesita poder leer un turno por id SIN filtrar por `status='open'` (a diferencia de `getOpenShift`) para poder generar el Corte del Día tanto de un turno cerrado como de una vista previa de un turno abierto (tasks.md 8.7). |
| Enriquecer una venta con nombres de producto/cliente para el ticket | Nueva función `getSaleTicketData(db, saleId)` en `sales.ts` (JOIN de solo lectura, no toca `createSale`/`getSaleById`) | `Sale`/`SaleLineResult`/`SalePaymentResult` (PR3) solo guardan `productId`/`customerId` — un ticket impreso necesita el NOMBRE, no el id. Se decidió NO modificar el contrato `Sale` existente (usado por `sales:create`, ya verificado) para no arriesgar romper nada de PR3; en cambio se agregó una función de lectura nueva, exclusiva para impresión. |
| `printing/print.ts` sin test automatizado dedicado | Documentado explícitamente como excepción, NO oculto | Requiere una `BrowserWindow` real de Electron (proceso GUI) — mismo precedente ya establecido y justificado en PR1-3 para `src/main/preload.ts`/`src/main/index.ts` ("wiring de infraestructura sin capa de test", no hay librería de testing de Electron en el proyecto). La lógica SÍ testeable (qué HTML se construye) vive en `ticket-template.ts` (TDD completo, 14 tests) y el WIRING de `ipc/print.ts` SÍ se prueba inyectando `printHtml` como parámetro sustituible (mismo patrón de inyección de dependencias que el `IpcMain` falso de todo el proyecto) — solo la llamada real a `webContents.print()` queda sin cubrir. |
| Cancelar impresión vs. fallo real de impresión | `printHtml` resuelve `{printed:false}` si el usuario cancela el diálogo nativo (`errorType==='cancelled'`), pero RECHAZA la promesa (error real) en cualquier otro caso (p. ej. impresora desconectada) | `ticket-printing/spec.md` distingue expresamente "Cancelar impresión" (la venta permanece guardada, no es un error) de "Impresora no disponible" (SHOULD informar el error, MUST permitir reintentar). Tratar ambos casos igual habría hecho que una cancelación normal se viera como un fallo en la UI. |
| Créditos screen (7.7): solo lista saldos + registra pagos, SIN "otorgar crédito manual sin venta" | Alcance literal de tasks.md 7.7 ("list balances, register payment") — no se agregó un formulario de "otorgar crédito nuevo" independiente de una venta | Ninguna tarea de Fase 7 lo pide explícitamente; `credit:grant` YA soporta ese caso (acepta `customerName`, `saleId: null`) si se decide agregar esa UI en un PR futuro, pero agregarla ahora sin que se pidiera habría sido diseño no solicitado (freelancing). |

## Deviations from Design

1. **"Ventas de contado" y "Ventas totales"** (Corte del Día, secciones 2 y
   6) siguen el texto LITERAL de `daily-report/spec.md` en vez de las
   fórmulas SQL sugeridas por `design.md` — ver tabla de Decisiones arriba
   para el detalle completo de por qué difieren y por qué no hay conflicto
   con "Ganancia del día".
2. **Estructura de archivos**: `db/queries/credits.ts` y `db/queries/
   reports.ts` son módulos nuevos que no aparecen en el árbol de
   `design.md` "Estructura de Carpetas" — mismo criterio ya usado en PR2/PR3
   para `shared/ipc-types.ts`/`shared/sale-math.ts` (un dominio nuevo =
   un archivo nuevo dentro de `db/queries/`, consistente con el patrón
   existente de `cash.ts`/`sales.ts`/`products.ts`).
3. Deviation de test runner ya documentada en PR1-3 se repite aquí:
   `tasks.md` 7.4/8.4 dicen `node:test`; se usó `vitest` (`openspec/
   config.yaml` fija `npx vitest run`).

Sin deviations de esquema: las tablas `customers`, `customer_credits` y
`credit_payments` ya existían completas desde PR1 (anticipando exactamente
esta Fase 7) — no fue necesaria ninguna migración nueva en este PR.

## Archivos creados

| Archivo | Qué hace |
|---|---|
| `src/main/db/queries/credits.ts` + `.test.ts` | `grantCredit` (resuelve cliente por id o nombre, crea si es nuevo), `payCredit` (rechaza si excede saldo), `getCustomerBalance`, `listCustomerBalances`, `listCreditPaymentsForShift`, `sumCreditPaymentsForShift` |
| `src/main/db/queries/reports.ts` + `.test.ts` | `getDailyCutReport` (las 9 secciones), `computeProfit` (puro), `computeTotalSales` (puro) |
| `src/main/ipc/credit.ts` + `.test.ts` | Wiring `credit:grant/pay` (guard `assertAuthenticated`) y `credit:balance/listBalances` (sin guard, lectura) |
| `src/main/ipc/reports.ts` + `.test.ts` | Wiring `reports:dailyCut` (guard `assertAuthenticated`) |
| `src/main/ipc/print.ts` + `.test.ts` | Wiring `print:sale/dailyCut`, con `printFn` inyectable para test sin `BrowserWindow` real |
| `src/main/printing/ticket-template.ts` + `.test.ts` | `buildSaleTicketHtml`, `buildDailyCutTicketHtml` (HTML puro, CSS 80mm, escapado de HTML) |
| `src/main/printing/print.ts` | `printHtml` — `BrowserWindow` oculta + `webContents.print()` (sin test dedicado, ver Decisiones) |
| `src/renderer/screens/Creditos.tsx` | Pantalla de Créditos: lista de saldos + formulario de registro de pago |
| `src/renderer/screens/CorteDelDia.tsx` | Pantalla de Corte del Día: 9 secciones en orden fijo, banner de vista previa, advertencia de productos sin costo, botón de impresión |

## Archivos modificados

| Archivo | Qué cambia |
|---|---|
| `src/shared/sale-math.ts` + `.test.ts` | `roundToCents` ahora exportado (antes privado) — reutilizado por `credits.ts`/`reports.ts` |
| `src/main/db/queries/cash.ts` + `.test.ts` | `getShiftCashSummary` ahora exportado (antes privado); nueva función `getShiftById` (busca un turno por id sin filtrar por status) |
| `src/main/db/queries/customers.ts` + `.test.ts` | Nuevas funciones `createCustomer`, `getCustomerById`, `findCustomerByName` |
| `src/main/db/queries/sales.ts` + `.test.ts` | Nueva función `getSaleTicketData` (enriquece una venta con nombres de producto/cliente para el ticket) |
| `src/main/ipc/customers.ts` + `.test.ts` | Nuevo handler `customers:create` |
| `src/shared/ipc-types.ts` | Nuevos tipos: `GrantCreditInput/Result`, `PayCreditInput/Result`, `CustomerBalance`, `CreditPaymentRecord`, `CreditApi`, `DailyCutReport`, `DepartmentSalesLine`, `ReportsApi`, `SaleTicketData/Line/Payment`, `PrintResult`, `PrintApi`; `PosApi` extendido con `credit`/`reports`/`print`; `CustomersApi` extendido con `create` |
| `src/main/preload.ts` | Expone `customers.create`, `credit.*`, `reports.dailyCut`, `print.sale/dailyCut` |
| `src/main/index.ts` | Registra `registerCreditIpc`/`registerReportsIpc`/`registerPrintIpc` |
| `src/renderer/components/SplitPaymentModal.tsx` | Nuevo tipo `PaymentDraft` (reemplaza `SalePaymentInput` como salida del modal); selector de cliente ahora incluye "+ Nuevo cliente" con input de nombre para la porción `credito` |
| `src/renderer/screens/Ventas.tsx` | `resolvePayments` (resuelve clientes nuevos vía `customers:create` antes de `sales:create`); tras la venta, llama `credit:grant` por cada porción `credito` (cierra el backfill de PR3); imprime el ticket automáticamente (5.10) con botón "Reimprimir ticket" y aviso de error si falla |
| `src/renderer/App.tsx` | Agrega navegación a "Creditos" y "Corte del Dia" |

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| Base (redondeo compartido) | `src/shared/sale-math.test.ts` | Unit (puro) | ✅ 16/16 antes de exportar `roundToCents` | ✅ Written | ✅ Passed | ✅ 3 casos (abajo, arriba, sin cambio) | ➖ None needed |
| Base (agregados de caja para reportes) | `src/main/db/queries/cash.test.ts` | Integration (`:memory:` real) | ✅ 19/19 antes de exportar `getShiftCashSummary` | ✅ Written | ✅ Passed | ✅ 2 casos (ceros, agregado real) | ➖ None needed |
| Base (leer turno por id sin filtrar status) | `src/main/db/queries/cash.test.ts` | Integration (`:memory:` real) | ✅ 21/21 antes de agregar `getShiftById` | ✅ Written | ✅ Passed | ✅ 3 casos (abierto, cerrado, inexistente) | ➖ None needed |
| 7.1/7.6 (`createCustomer`/`getCustomerById`/`findCustomerByName`) | `src/main/db/queries/customers.test.ts` | Integration (`:memory:` real) | ✅ 3/3 antes de agregar | ✅ Written | ✅ Passed | ✅ 8 casos (crear x3, buscar por id x3, buscar por nombre x2) | ➖ None needed |
| 7.6 (`customers:create` wiring) | `src/main/ipc/customers.test.ts` | Integration (`IpcMain` falso) | ✅ 1/1 antes de agregar | ✅ Written | ✅ Passed | ➖ Single (un solo canal nuevo) | ➖ None needed |
| 7.1/7.2/7.3/7.4 (`grantCredit`/`payCredit`/`getCustomerBalance`/`listCustomerBalances`/`listCreditPaymentsForShift`) | `src/main/db/queries/credits.test.ts` | Integration (`:memory:` real, sin mocks) | N/A (new) | ✅ Written | ✅ Passed | ✅ 17 casos (grant x7 incl. cliente nuevo/reuso/acumulación/validaciones, balance x2, pay x5 incl. rechazo por exceso/pago exacto/sin deuda, listBalances x1, listPayments x2) | ➖ None needed |
| 7.1/7.2 (guard `credit:grant`/`credit:pay`, verificación adversarial) | `src/main/ipc/credit.test.ts` | Integration (`IpcMain` falso) | N/A (new) | ✅ Written | ✅ Passed | ✅ 6 casos (grant ok, grant rechazado sin sesión, pay ok, pay rechazado sin sesión, balance sin guard, listBalances sin guard) — **guard comentado explícitamente y confirmado que 2/6 pasan a rojo (los 2 dependientes del guard), luego restaurado a 6/6** | ➖ None needed |
| 8.1/8.2 (`computeProfit`, `computeTotalSales`, `getDailyCutReport`) | `src/main/db/queries/reports.test.ts` | Unit (puro, 2 funciones) + Integration (`:memory:` real) | N/A (new) | ✅ Written | ✅ Passed | ✅ 13 casos (profit x5, totalSales x2, reporte completo de 9 secciones x1, "NO HUBO PAGOS" x1, turno cerrado x1, ejemplo tasks.md 6.4 reutilizado x1, turno inexistente x1, departamentos sin ventas omitidos x1) | ➖ None needed |
| 8.1 (guard `reports:dailyCut`, verificación adversarial) | `src/main/ipc/reports.test.ts` | Integration (`IpcMain` falso) | N/A (new) | ✅ Written | ✅ Passed | ➖ Single (un solo canal con guard) — **guard comentado explícitamente y confirmado que 1/2 pasa a rojo, luego restaurado a 2/2** | ➖ None needed |
| Fase 9 (enriquecer venta con nombres) | `src/main/db/queries/sales.test.ts` | Integration (`:memory:` real) | ✅ 20/20 antes de agregar `getSaleTicketData` | ✅ Written | ✅ Passed | ✅ 2 casos (venta con líneas+pagos reales, venta inexistente) | ➖ None needed |
| 9.1/9.2/9.3 (`buildSaleTicketHtml`/`buildDailyCutTicketHtml`) | `src/main/printing/ticket-template.test.ts` | Unit (puro, HTML string) | N/A (new) | ✅ Written | ✅ Passed | ✅ 14 casos (CSS 80mm x2, contenido de líneas/pagos x3, escapado HTML x1, orden de las 9 secciones x1, advertencia de sin-costo x2, "NO HUBO PAGOS" x1, listados x2, banner de vista previa x2) | ➖ None needed |
| 9.4/9.5 (`registerPrintIpc`, wiring con `printFn` inyectable) | `src/main/ipc/print.test.ts` | Integration (`IpcMain` falso + `printFn` falso) | N/A (new) | ✅ Written | ✅ Passed | ✅ 3 casos (print:sale construye HTML correcto, print:dailyCut construye HTML correcto, fallo de impresión se propaga como rechazo) | ➖ None needed |

### Test Summary

- **Total tests nuevos (PR4)**: 74 (3 roundToCents + 2 getShiftCashSummary +
  3 getShiftById + 8 customers.ts + 1 customers:create + 17 credits.ts +
  6 ipc/credit + 13 reports.ts + 2 ipc/reports + 2 getSaleTicketData +
  14 ticket-template + 3 ipc/print)
- **Total tests pasando (PR4)**: 74/74
- **Total tests pasando (proyecto completo, PR1+PR2+PR3+PR4)**: 215/215
  (`npx vitest run`, 25 archivos)
- **Layers used**: Unit (roundToCents, computeProfit, computeTotalSales,
  ticket-template — todas puras), Integration (credits/reports/customers/
  cash/sales contra `node:sqlite` real, sin mocks; ipc/credit, ipc/reports,
  ipc/print, ipc/customers con `IpcMain` falso)
- **Approval tests** (safety net antes de modificar archivos existentes): 5
  — `sale-math.test.ts` (16/16), `cash.test.ts` (19/19 y 21/21, dos cambios
  distintos), `customers.test.ts` (3/3), `sales.test.ts` (20/20)
- **Pure functions created**: `computeProfit`, `computeTotalSales`,
  `escapeHtml`, `money`, `buildSaleTicketHtml`, `buildDailyCutTicketHtml` (6;
  `roundToCents` ya existía, solo se exportó)
- **Mocks usados**: 0 mocks de librerías externas. Dobles de prueba: `IpcMain`
  falso (mismo patrón de todo el proyecto) y `printFn` falso (`vi.fn()`,
  inyección de dependencia explícita en `registerPrintIpc`)
- **Hallazgos adversariales verificados**: 2 (guard de `credit:grant`/
  `credit:pay` en `ipc/credit.test.ts`, guard de `reports:dailyCut` en
  `ipc/reports.test.ts`) — ambos confirmados: comentar el guard hizo fallar
  EXACTAMENTE los tests que dependen de él (ni más ni menos), guard
  restaurado y suite verde de nuevo en ambos casos.

## Comandos verificados (todos pasan)

```
npx vitest run    → 25 files, 215/215 tests passed (141 previos + 74 nuevos)
npm run typecheck → tsc --noEmit limpio (node + web)
npm run build     → typecheck + electron-vite build OK (renderer bundle 685.08KB)
```

## Limitaciones documentadas (alcance explícito de este PR)

1. **Pantalla de Créditos (7.7) no incluye "otorgar crédito manual sin
   venta"** — solo lista saldos y registra pagos, tal como pide tasks.md
   literalmente. El backend (`credit:grant` con `customerName`, `saleId:
   null`) ya lo soporta si se pide explícitamente en un PR futuro.
2. **No hay pantalla de historial de turnos cerrados.** `CorteDelDia.tsx`
   carga automáticamente el turno abierto actual (vista previa) y permite
   consultar OTRO turno tecleando su id manualmente — no hay un listado
   navegable de turnos pasados (misma limitación ya documentada en PR3,
   sigue sin resolverse porque ninguna spec de este cambio la exige).
3. **`printing/print.ts` sin test automatizado** (Electron `BrowserWindow`
   real) — ver Decisiones arriba. Verificación manual pendiente para el
   día D (tasks.md 11.2, Fase 11/PR5): imprimir un ticket real y confirmar
   el layout de 80mm con nombres de producto reales.
4. **`sales:create` no fue modificado** para escribir directamente en
   `customer_credits` — el backfill se resuelve en el RENDERER (dos
   invokes secuenciales: `sales:create` luego `credit:grant` por cada
   porción `credito`), no en una única transacción atómica del main
   process. Si el proceso renderer se cae ENTRE ambos invokes, la venta
   quedaría guardada pero el crédito no otorgado — riesgo aceptado
   explícitamente por ser una app de una sola terminal con un solo cajero a
   la vez (sin concurrencia), y por no reabrir/tocar la transacción de
   `sales:create` ya verificada en PR3. Si se quisiera cerrar esto por
   completo, un PR futuro podría mover la escritura de `customer_credits`
   DENTRO de la misma transacción de `createSale` — no se hizo aquí para
   minimizar el riesgo sobre código ya verificado, según la instrucción
   explícita de esta sesión de priorizar solidez sobre las fases nuevas.

## Pendiente para PR5 (Fases 10-11, NO implementado en este PR)

- **Fase 10 — Empaquetado y CI**: `preload.ts` ya expone toda la superficie
  de API necesaria (auth, catalog, sales, cash, customers, credit, reports,
  print) — falta el workflow de GitHub Actions (`build-mac.yml`), firma
  ad-hoc, empaquetado `.dmg` y publicación a Releases, todo per `design.md`
  "Pipeline CI/CD".
- **Fase 11 — Validación en sitio**: confirmar modelo real de impresora +
  versión de macOS, imprimir un ticket real de 80mm (usa las plantillas de
  `ticket-template.ts` de este PR), probar el escáner USB-HID real, validar
  el bypass de Gatekeeper, y correr el E2E manual completo (abrir turno →
  venta con pago dividido, incluyendo una porción a crédito → cerrar turno →
  imprimir corte). Ninguna de estas tareas es automatizable (dependen de
  hardware físico real), tal como ya anticipaba `design.md` "Testing
  Strategy".

## Status (PR4)

20/20 tasks (Fase 7: 7/7, Fase 8: 7/7, Fase 9: 6/6) completas, más el cierre
de la tarea 5.10 diferida desde PR3. 67/67 tasks totales (Fase 1-9) del
cambio `pos-inicial`. 215/215 tests pasan, build y typecheck limpios. Listo
para `sdd-verify` de este work unit, o para continuar directo con PR5
(Fases 10-11, último PR del plan) según la estrategia de entrega del
usuario.

---

# PR4 fix: redondeo de cashOnHand

## Scope de este fix

Corrección puntual del hallazgo **WARNING-1** de `verify-report-pr4.md`
(verificación independiente), antes de iniciar PR5. NO es un PR nuevo del
plan de 5 — es un fix de bajo riesgo sobre `src/main/db/queries/reports.ts`,
mismo patrón que el fix puntual aplicado antes de PR4 (ver sección "PR3
fix: tolerancia de centavos" arriba).

## El bug

`getDailyCutReport` calcula 6 magnitudes de dinero en la sección "Corte del
Día". El verificador confirmó que 5 de las 6 (`cashEntriesTotal`,
`supplierPaymentsTotal`, `cashSalesTotal`, `bankTotal`, `totalSales`,
`profit`) pasan por `roundToCents` (`src/shared/sale-math.ts`), pero
`cashOnHand` (sección 4, "Dinero en caja") era la **única** que no —
llamaba a `computeExpectedCash(...)` (`src/main/db/queries/cash.ts`) y
devolvía el resultado crudo, sin redondear.

Reproducción numérica real (confirmada por el verificador y de nuevo aquí
con un test de integración contra `node:sqlite` real, no solo aritmética
en aislado):

```
openingCash 500.35, cashInTotal 0, cashSalesTotal (62.71+85.55+33.33),
cashOutTotal 300.10
→ 381.84000000000003 (residuo real de punto flotante, no 381.84 exacto)
```

Es el mismo patrón de bug que causó el **CRITICAL** real de PR3 (commit
`64ceb2b`: tolerancia de un centavo completo en `paymentsMatchTotal`,
también originado en no redondear a centavos en el punto de cálculo). Aquí
la severidad quedó en WARNING (no CRITICAL) porque los dos únicos
consumidores de `report.cashOnHand` (`CorteDelDia.tsx` vía
`.toFixed(2)`, y `ticket-template.ts` vía `money()` = `.toFixed(2)`)
formatean con 2 decimales al mostrar, y `toFixed(2)` redondea
correctamente incluso con ruido de `1e-13`. No había dato incorrecto
visible al cajero o al administrador hoy — pero el residuo SÍ vivía en el
dato (`DailyCutReport.cashOnHand`) antes de cualquier formateo, listo para
volverse un bug real y visible el día que un PR futuro consuma ese campo
para algo que no sea display (conciliación automática, alerta de
diferencia, exportación a CSV/contabilidad). Ninguno de los tests
existentes en `reports.test.ts` ejercitaba `cashOnHand` con montos
fraccionarios (todos usaban enteros: 700, 900, 300, 1300) — ese gap de
cobertura ocultaba la inconsistencia.

## La corrección

Se envolvió la llamada a `computeExpectedCash(...)` en `roundToCents`
dentro de `getDailyCutReport` (`src/main/db/queries/reports.ts`),
reutilizando la MISMA función de `src/shared/sale-math.ts` que ya usan las
otras 5 magnitudes monetarias — sin reinventar lógica de redondeo, sin
tocar `computeExpectedCash` en `cash.ts` (que sigue usándose sin redondeo
en `closeShift`, donde la diferencia real sin redondear entre
`countedCash` y `expectedCash` es información válida de conciliación, no
un bug — eso quedó fuera de este fix, no era parte del hallazgo).

## Evidencia TDD (RED → GREEN)

### TDD Cycle Evidence

| Comportamiento | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| `cashOnHand` redondeado a centavos exactos con montos fraccionarios | `src/main/db/queries/reports.test.ts` | Integration (`node:sqlite` real) | ✅ 13/13 (tests previos de reports.test.ts) | ✅ Escrito (`500.35+62.71+85.55+33.33-300.10` esperaba `381.84` exacto; código daba `381.84000000000003`, confirmado ejecutando el test) | ✅ Pasa tras envolver `computeExpectedCash(...)` en `roundToCents` | ✅ Cubierto por el test nuevo (residuo fraccionario, caso que faltaba) + 4 tests preexistentes que ya afirman `cashOnHand` exacto con enteros (600, 1300) y siguen pasando sin cambio de comportamiento — confirma que el wrap no rompe los casos donde no había residuo visible | ➖ None needed (wrap de una función pura ya existente, sin lógica nueva que refactorizar) |

### Test Summary

- **Total tests nuevos**: 1 (`reports.test.ts`)
- **Total tests pasando (antes del fix, baseline/safety net)**: 215/215 (25 archivos)
- **Total tests pasando (después del fix)**: 216/216 (25 archivos)
- **Layers used**: Integration (1, `node:sqlite` real vía `openShift`/`createSale`/`cashOut`/`getDailyCutReport`)
- **Approval tests**: N/A — no fue un refactor de comportamiento existente sin tests, fue una corrección de bug con un test nuevo que falla contra el código viejo (RED real, residuo reproducido) y pasa contra el código corregido (GREEN real)
- **Pure functions modificadas**: ninguna nueva — se reutilizó `roundToCents` ya existente y exportada en `src/shared/sale-math.ts` desde PR4
- **Mocks usados**: 0

## Comandos verificados (todos pasan)

```
npx vitest run src/main/db/queries/reports.test.ts  → 14/14 tests (13 previos + 1 nuevo)
npx vitest run                                       → 25 files, 216/216 tests passed
npm run build (typecheck:node + typecheck:web + electron-vite build) → limpio
```

## Archivos modificados

| Archivo | Qué cambió |
|---|---|
| `src/main/db/queries/reports.ts` | `cashOnHand` ahora se envuelve en `roundToCents(...)` (reutiliza `src/shared/sale-math.ts`); comentario del docstring de `getDailyCutReport` (sección 4) actualizado para documentar el fix y por qué era la única magnitud sin redondear |
| `src/main/db/queries/reports.test.ts` | +1 test de integración (`getDailyCutReport`) que reproduce el residuo de punto flotante real (`381.84000000000003`) con montos fraccionarios de centavos (turno con `openingCash` fraccionario, 3 ventas en efectivo con montos fraccionarios y una salida fraccionaria) y confirma que `cashOnHand` es ahora exactamente `381.84` |

## Deviations from Design

Ninguna — corrección de bug dentro del mismo criterio ya establecido en
PR4 (reutilizar `roundToCents` de `sale-math.ts` para toda magnitud de
dinero de `getDailyCutReport`), no un cambio de arquitectura ni de
fórmula. Las 9 fórmulas del Corte del Día verificadas en
`verify-report-pr4.md` no cambian — solo se corrige que la fórmula 4 use
la misma disciplina de redondeo que las fórmulas 1, 3, 5, 6 y 7.

## WARNING-2 (sales:create + credit:grant no atómicos): RIESGO ACEPTADO Y DIFERIDO — decisión explícita del usuario, NO implementado

**Esto NO se implementó en este fix ni se implementará en PR5.** Se
documenta aquí con el máximo detalle posible para que quien retome este
proyecto en el futuro entienda que es una **decisión consciente**, no un
descuido ni una tarea olvidada.

### Qué dice el hallazgo (verify-report-pr4.md, WARNING-2)

`Ventas.tsx` (`handleConfirmPayment`) ejecuta la venta con crédito en DOS
llamadas IPC separadas y secuenciales desde el renderer, sin transacción
que las una:

1. `sales:create` — crea la venta y sus `sale_payments` (incluida la
   porción con `method: 'credito'` y `customer_id`).
2. **Solo después**, en un `for` separado, se llama `credit:grant` por
   cada porción de crédito de esa venta — esto es lo que efectivamente
   incrementa `customer_credits` (el saldo real que el cliente debe).

Si el proceso de Electron muere **entre** ambas llamadas (ej. corte de
luz), la venta queda guardada con la porción de crédito ya registrada en
`sale_payments`, pero `customer_credits` NUNCA se actualiza — el negocio
pierde el registro de que ese cliente debe dinero. Es dinero real,
adeudado por un cliente, que desaparece silenciosamente del sistema de
crédito aunque la venta sí quedó registrada.

Edge case adicional encontrado por el verificador (no solo el riesgo de
atomicidad): `SplitPaymentModal.tsx` no valida que una porción de crédito
tenga monto mayor a 0 antes de habilitar "Confirmar venta". Si un cajero
deja una porción de crédito en 0 mientras otra porción cubre el resto,
la venta se guarda con éxito, pero el loop de `credit:grant` en
`Ventas.tsx` lanza (porque `grantCredit` rechaza monto ≤ 0), dejando la
pantalla en un estado confuso: la venta YA está guardada (sin rollback),
pero el flujo se interrumpe antes de limpiar el estado — un reintento del
cajero crearía una segunda venta duplicada por el mismo total.

### Por qué es un riesgo real y no solo teórico

`openspec/config.yaml` documenta explícitamente que el local de este
negocio ("Bahía de los Ángeles") **pierde luz e internet seguido**.
Aunque la app es 100% offline (no depende de internet para operar), un
corte de luz SÍ puede matar el proceso de Electron a la mitad de la
ventana entre `sales:create` y `credit:grant` — es exactamente el
escenario operativo real que el propio negocio ya identificó como su
riesgo principal, aplicado ahora a dinero adeudado por clientes en vez de
a dinero en caja.

### Por qué queda diferido y no se corrige ahora

Instrucción explícita del usuario para esta sesión: corregir ÚNICAMENTE
el WARNING-1 (redondeo de `cashOnHand`) como fix puntual antes de PR5, y
documentar el WARNING-2 como riesgo aceptado y diferido — sin
implementarlo, sin tocar la atomicidad de créditos, sin tocar Fases
10-11. Cerrar el WARNING-2 correctamente requiere mover la escritura de
`customer_credits` a la MISMA transacción SQL de `createSale` (mencionado
como opción en `verify-report-pr4.md`, Issues Found #2), lo cual es un
cambio de mayor alcance sobre código ya verificado (Fases 5-9) — no un fix
de una línea como el de `cashOnHand`. El usuario decidió priorizar avanzar
a PR5 sin ese refactor por ahora, aceptando la ventana de riesgo descrita
arriba.

### Qué debe saber quien retome esto

- **Síntoma si el riesgo se materializa**: una venta con porción de
  crédito aparece en `sales`/`sale_payments` (y en reportes de ventas),
  pero el saldo del cliente en `customer_credits`/`getCustomerBalance` NO
  refleja esa deuda. El negocio cree que cobró crédito que en realidad
  nunca quedó registrado como pendiente.
- **Cómo detectarlo en producción**: comparar `SUM(sale_payments.amount)
  WHERE method='credito')` contra `SUM(customer_credits.amount)` — si no
  coinciden, hay ventas de crédito "huérfanas" sin su alta correspondiente
  en `customer_credits`.
- **Cómo cerrarlo cuando se decida abordarlo**: mover el `INSERT` de
  `customer_credits` (hoy en `credit:grant`/`grantCredit`) dentro de la
  misma transacción SQL que ya usa `createSale` (`src/main/db/queries/
  sales.ts`), para que ambas escrituras confirmen o fallen juntas.
  Adicionalmente, corregir el edge case de `SplitPaymentModal.tsx`
  validando monto > 0 en porciones de crédito antes de habilitar
  "Confirmar venta", para eliminar por completo la ventana de error
  post-guardado descrita arriba.
- **No confundir con el WARNING-1**: son hallazgos independientes del
  mismo `verify-report-pr4.md`. El WARNING-1 (este fix) ya está resuelto.
  El WARNING-2 (esta sección) sigue abierto por decisión explícita, no
  por parte de este fix.

## Status (PR4 fix)

Fix completo y acotado exactamente al WARNING-1. 216/216 tests pasan
(215 previos + 1 nuevo), build y typecheck limpios. El WARNING-1 de
`verify-report-pr4.md` queda resuelto: las 6 magnitudes de dinero de
`getDailyCutReport` ahora pasan consistentemente por `roundToCents`. El
WARNING-2 queda **explícitamente abierto y diferido** (ver sección
arriba) — no se tocó la atomicidad de `sales:create`+`credit:grant`, ni
las Fases 10-11. Listo para continuar con PR5 según la estrategia de
entrega del usuario, con el WARNING-2 documentado como riesgo conocido y
aceptado.
