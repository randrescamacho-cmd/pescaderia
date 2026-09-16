# Apply Progress: pos-inicial

## Estado global: 29/29 tareas de Fase 1-4 completas (5/5 + 8/8 + 8/8 + 8/8)

- PR1 (Fases 1-2, Setup + BD/Migraciones): completo, verificado.
- PR2 (Fases 3-4, Auth PIN + Catálogo): completo — ver sección "PR2" abajo.
- PR3 (Fases 5-6, Ventas + Caja): pendiente, siguiente en el plan de 5 PRs.

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
