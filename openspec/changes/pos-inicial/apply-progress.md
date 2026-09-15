# Apply Progress: pos-inicial — PR1 (Fases 1-2)

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

## Departamentos seed: 9, no 8

`catalog-management/spec.md` lista 8 departamentos de ejemplo y omite
"Juguetes". `openspec/config.yaml` (contexto de negocio, fuente primaria)
lista 9 e incluye "Juguetes". Se usó la lista de `config.yaml` (superset) para
no perder un departamento real de la tienda. Si esto fue un error de la spec
(no del config), corregir `catalog-management/spec.md` en un PR de specs.

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

## Pendiente para PR2 (Fases 3-4, NO implementado en este PR)

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

## Status

13/13 tasks (Fase 1: 5/5, Fase 2: 8/8) completas. Listo para `sdd-verify` de
este work unit, o para continuar directo con PR2 (Fases 3-4) según la
estrategia de entrega del usuario.
