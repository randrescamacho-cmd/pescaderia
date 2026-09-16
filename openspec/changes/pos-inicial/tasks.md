# Tasks: POS de escritorio "Bahía de los Ángeles" (pos-inicial)

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~2,600-3,200 (11 phases, ~45-55 new files) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR1 setup+DB, PR2 auth+catálogo, PR3 ventas+caja, PR4 créditos+reporte+impresión, PR5 empaquetado/CI+validación |
| Delivery strategy | ask-on-risk (none received explicitly; using shared default) |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Setup + DB schema/migrations (Phases 1-2) | PR 1 | Foundation; ~500-600 lines; nothing else can start without it |
| 2 | Auth PIN + Catálogo (Phases 3-4) | PR 2 | Depends on PR 1 (roles/products tables) |
| 3 | Ventas + Caja (Phases 5-6) | PR 3 | Depends on PR 2 (auth guard, catalog lookup) |
| 4 | Créditos + Corte del Día + Impresión (Phases 7-9) | PR 4 | Depends on PR 3 (sales/shift data) |
| 5 | Empaquetado/CI + Validación en sitio (Phases 10-11) | PR 5 | Depends on PR 4; no app logic, safe to isolate |

## Phase 1: Setup del Proyecto

- [x] 1.1 Scaffold with `electron-vite` React+TS template; verify dev run
- [x] 1.2 Enable strict TS in root/main/renderer `tsconfig.json`
- [x] 1.3 Create folders: `src/main/{db,ipc,printing,auth}`, `src/renderer/{screens,components}`
- [x] 1.4 Add `electron-builder.yml` (mac target, dmg, arm64/x64)
- [x] 1.5 Check bundled Node's `node:sqlite` flag need; add `--experimental-sqlite` switch in `main/index.ts` before `app.ready` if required

## Phase 2: Esquema de BD y Migraciones

- [x] 2.1 `src/main/db/connection.ts` — open `node:sqlite`, enable `PRAGMA foreign_keys`
- [x] 2.2 `src/main/db/migrations/index.ts` migration `1:init` — all tables per design.md (roles, departments, products, shifts, cash_movements, sales, sale_lines, sale_payments, customers, customer_credits, credit_payments, schema_migrations)
- [x] 2.3 Migration runner: create `schema_migrations`, apply pending versions in a transaction on startup
- [x] 2.4 Migration `2:seed_roles` — insert `usuario`/`administrador` rows with placeholder PIN
- [x] 2.5 Migration `3:seed_departments` — insert known departments (Saldos, Mariscos, Venta de Pescado, etc.)
- [x] 2.6 Mirror `db/schema.sql` (docs only, non-runtime)
- [x] 2.7 RED: test — migrations apply in order on temp SQLite file (usando `vitest`, no `node:test`; ver apply-progress.md Deviations — `openspec/config.yaml` fija `test_command: npx vitest run` como runner del proyecto)
- [x] 2.8 GREEN: make migration runner pass 2.7

## Phase 3: Autenticación por PIN de Rol

- [x] 3.1 `src/main/auth/pin.ts` — `scryptSync` hash + `timingSafeEqual` verify
- [x] 3.2 RED: `node:test` — hash/verify correctness, wrong PIN rejected (usando `vitest`, ver apply-progress.md Deviations, mismo criterio que 2.7/2.8 de PR1)
- [x] 3.3 GREEN: implement 3.1 to pass 3.2
- [x] 3.4 IPC `auth:login` — compare PIN vs both role hashes
- [x] 3.5 IPC `auth:changePin` — Administrador-only, rehash + update role row
- [x] 3.6 `preload.ts` — expose `auth.login`/`auth.changePin` via `contextBridge`
- [x] 3.7 Renderer: Login screen with numeric keypad
- [x] 3.8 Renderer: in-memory session state (role), no persistence across restarts

## Phase 4: Catálogo (Departamentos y Productos)

- [x] 4.1 IPC `catalog:listDepartments/createDepartment/updateDepartment/deleteDepartment` (soft-delete `active`, block delete if active products reference it)
- [x] 4.2 IPC `catalog:listProducts/createProduct/updateProduct/deleteProduct` — validate price > 0, department required
- [x] 4.3 IPC `catalog:findByBarcode`
- [x] 4.4 Role guard middleware: reject Admin-only IPC calls when session role = `usuario`
- [x] 4.5 RED: `node:test` — delete-department-with-products rejected; product without department rejected (usando `vitest`)
- [x] 4.6 GREEN: implement 4.1/4.2 validations to pass 4.5
- [x] 4.7 Renderer: Departamentos screen (Admin only) — CRUD + blocked-delete message
- [x] 4.8 Renderer: Productos screen (Admin only) — CRUD form (name, price, cost, department, barcode)

## Phase 5: Ventas

- [x] 5.1 IPC `sales:create` — transaction insert `sales`+`sale_lines` (snapshot dept/cost/price)+`sale_payments`
- [x] 5.2 Validate: quantity > 0 per line; sale must have ≥1 line
- [x] 5.3 Validate: sum of payment portions == total; `credito` portion requires customer
- [x] 5.4 RED: `node:test` — split-sum mismatch rejected, empty sale rejected, credito-without-customer rejected (usando `vitest`, ver apply-progress.md Deviations)
- [x] 5.5 GREEN: implement 5.1-5.3 to pass 5.4
- [x] 5.6 Renderer: Ventas screen — line entry, running total, remove line
- [x] 5.7 Renderer: barcode buffer listener (`keydown` gap <50ms + Enter heuristic)
- [x] 5.8 Renderer: "producto no encontrado" toast on unknown barcode
- [x] 5.9 Renderer: split-payment modal (efectivo/tarjeta/credito) with customer picker for credito — selector simplificado (solo clientes ya capturados, ver apply-progress.md "Limitaciones")
- [x] 5.10 Wire sale-close success to ticket printing IPC (Phase 9) — completado en PR4 (`Ventas.tsx`, `printSaleTicket`), diferido desde PR3 por dependencia de Fase 9

## Phase 6: Caja

- [x] 6.1 IPC `cash:openShift` — reject if an open shift already exists
- [x] 6.2 IPC `cash:cashIn`/`cash:cashOut` — proveedor+motivo required on salida
- [x] 6.3 IPC `cash:closeShift` — compute expected cash, accept counted cash, store difference
- [x] 6.4 RED: `node:test` — second-open rejected, salida-without-motivo rejected, reconciliation formula ($700+$900-$300=$1,300) (usando `vitest`)
- [x] 6.5 GREEN: implement 6.1-6.3 to pass 6.4
- [x] 6.6 Renderer: Apertura de turno screen
- [x] 6.7 Renderer: Entradas/Salidas screen
- [x] 6.8 Renderer: Cierre de turno screen showing expected vs counted diff

## Phase 7: Créditos de Clientes

- [x] 7.1 IPC `credit:grant` — create customer if new, insert `customer_credits`
- [x] 7.2 IPC `credit:pay` — insert `credit_payments`, clamp/reject if amount > balance (ver apply-progress.md: decision = rechazar, no limitar)
- [x] 7.3 IPC `credit:balance` — `SUM(customer_credits) - SUM(credit_payments)`
- [x] 7.4 RED: `vitest` — overpay rechazado, partial payment reduces balance correctly (ver apply-progress.md Deviations, mismo criterio de runner que PR1-3)
- [x] 7.5 GREEN: implement 7.1-7.3 to pass 7.4
- [x] 7.6 Renderer: customer picker/creator inside split-payment modal (5.9)
- [x] 7.7 Renderer: Créditos screen — list balances, register payment

## Phase 8: Corte del Día

- [x] 8.1 IPC `reports:dailyCut` — 9 section queries per `shift_id` (per design.md table; ver apply-progress.md "Fase 8" para 2 deviations deliberadas vs. design.md, siguiendo el texto literal de daily-report/spec.md)
- [x] 8.2 Ganancia del día: missing-cost=0 + count-of-uncosted-products warning
- [x] 8.3 "NO HUBO PAGOS" literal string when no credit payments that shift
- [x] 8.4 RED: `vitest` — all 9 formulas incl. cash-reconciliation cross-check, ganancia-with-missing-cost (ver apply-progress.md Deviations, mismo criterio de runner que PR1-3)
- [x] 8.5 GREEN: implement 8.1-8.3 to pass 8.4
- [x] 8.6 Renderer: Corte del Día screen — fixed 9-section order, warning banner
- [x] 8.7 Renderer: open-shift preview mode (SHOULD, non-blocking)

## Phase 9: Impresión de Tickets

- [x] 9.1 `src/main/printing/ticket-template.ts` — sale-ticket HTML builder
- [x] 9.2 Extend `ticket-template.ts` — Corte del Día HTML (9 sections)
- [x] 9.3 CSS `@page { size: 80mm auto; margin:0 }`, monospace body, no clipped fields
- [x] 9.4 `src/main/printing/print.ts` — hidden `BrowserWindow` + `webContents.print()` (sin test automatizado dedicado, ver apply-progress.md "Fase 9" — mismo precedente que preload.ts/index.ts en PR1-3)
- [x] 9.5 IPC `print:sale`/`print:dailyCut`
- [x] 9.6 Error path: printer unavailable — surface error, allow retry without losing saved sale/report data

## Phase 10: Empaquetado y CI

- [x] 10.1 `src/main/preload.ts` — `contextBridge.exposeInMainWorld` full API surface (ya completo desde PR4 — `preload.ts` expone auth/catalog/sales/cash/customers/credit/reports/print; confirmado, sin cambios en PR5)
- [x] 10.2 `src/main/index.ts` — `BrowserWindow` lifecycle, `contextIsolation:true`, `nodeIntegration:false` (ya completo desde PR1 — confirmado, sin cambios en PR5)
- [x] 10.3 `.github/workflows/build-mac.yml` per design.md (macos-latest, arm64/x64 matrix) — sintaxis YAML validada localmente con `js-yaml`; ver apply-progress.md "PR5" para deviations documentadas vs. el borrador de design.md (Node 24 en vez de 22, trigger de push a `main` agregado)
- [x] 10.4 Ad-hoc codesign step (`codesign --force --deep --sign -`) before dmg packaging
- [x] 10.5 `--prepackaged` dmg build step from signed `.app`
- [x] 10.6 Tag-triggered upload to GitHub Releases

## Phase 11: Validación en Sitio

Estas 5 tareas describen verificación física en la Mac real del cliente
(impresora, escáner, red, Gatekeeper) — **no son ejecutables desde esta
sesión** (sin acceso a esa Mac ni al hardware). Lo entregable de PR5 para
esta fase es el checklist accionable (`docs/validacion-sitio.md`) que
permite a quien SÍ esté físicamente en el sitio ejecutar y marcar cada
punto. Las casillas de abajo se dejan deliberadamente sin marcar — marcarlas
`[x]` sin haber estado en la Mac real del cliente sería reportar una
confirmación falsa de algo no verificado.

- [ ] 11.1 Confirm exact thermal printer model + macOS version on client Mac — checklist listo en `docs/validacion-sitio.md` sección 1; pendiente de ejecución real en sitio
- [ ] 11.2 Print real test ticket, verify 80mm layout with real product names — checklist listo en `docs/validacion-sitio.md` sección 3; pendiente de ejecución real en sitio
- [ ] 11.3 Scan real barcode end-to-end with USB-HID scanner — checklist listo en `docs/validacion-sitio.md` sección 4; pendiente de ejecución real en sitio
- [ ] 11.4 Verify Gatekeeper bypass (right-click → Abrir) unlocks normal double-click launch after — checklist listo en `docs/validacion-sitio.md` sección 2 y procedimiento paso a paso en `README.md`; pendiente de ejecución real en sitio
- [ ] 11.5 Full offline E2E: abrir turno → venta con pago dividido → cerrar turno → imprimir corte — checklist listo en `docs/validacion-sitio.md` secciones 5 y 7; pendiente de ejecución real en sitio
