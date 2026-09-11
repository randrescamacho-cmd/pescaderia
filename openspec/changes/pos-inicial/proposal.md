# Proposal: POS de escritorio "Bahía de los Ángeles" (pos-inicial)

## Intent

La tienda opera hoy con un POS de escritorio (Windows) que se debe
reemplazar. El local pierde luz/internet con frecuencia, por lo que un
sistema web/PWA con backend remoto es inaceptable: se necesita una app
**instalada**, **100% offline**, con datos persistidos en disco local, que
reproduzca la funcionalidad del sistema actual (referencia: ticket físico de
"Corte del Día") sin depender de conectividad ni de un servidor.

## Scope

### In Scope (paridad completa, no MVP)

- Catálogo de productos con **un departamento fijo por producto** (lista de
  departamentos administrable, no hardcodeada)
- Ventas con formas de pago **efectivo** y **tarjeta**
- Caja: apertura de turno, entradas de efectivo, salidas a proveedores,
  conciliación caja/banco
- Costo por producto y cálculo de **ganancia del día** (venta − costo)
- Créditos de clientes ("fiado"): registro de crédito y registro de pagos
  de crédito
- Reporte **"Corte del Día"** con las mismas secciones del ticket de
  referencia: Entradas efectivo, Ventas de contado, Salidas/Proveedores,
  Dinero en caja, Dinero en bancos, Ventas totales, Ganancia del día, Pagos
  de créditos, Ventas por departamento
- Dos roles con PIN compartido por rol (Usuario/cajero, Administrador);
  Administrador gestiona departamentos y productos
- Entrada de código de barras vía escáner USB-HID (sin driver propio —
  tratado como teclado)
- Impresión de tickets a la impresora térmica ya instalada como impresora
  normal de macOS (diálogo nativo, sin ESC/POS crudo)
- Empaquetado como `.app`/`.dmg` instalable (ícono en Dock/Launchpad)

### Out of Scope (explícitamente diferido)

- Cuentas individuales por empleado / auditoría de "quién vendió qué"
- Multi-terminal / sincronización entre varias Mac o red LAN
- Reportes históricos multi-mes o multi-sesión más allá del corte diario
- Integración de báscula u otro hardware distinto a escáner HID e impresora
- Firma de código con Apple Developer Program (bypass manual de Gatekeeper
  aceptable para un solo cliente)
- Backup/restore automatizado a nube (backup manual del archivo `.sqlite`
  queda fuera de esta versión)

## Capabilities

### New Capabilities
- `catalog-management`: departamentos configurables y productos con costo, precio y departamento fijo
- `sales-transactions`: registro de ventas, líneas de venta, formas de pago (efectivo/tarjeta)
- `cash-register`: apertura de caja, entradas de efectivo, salidas a proveedores, conciliación caja/banco
- `customer-credit`: crédito de clientes ("fiado") y pagos de crédito
- `daily-report`: cálculo y render del "Corte del Día" con las secciones del ticket de referencia
- `auth-roles`: PIN compartido por rol (Usuario/Administrador) y control de acceso a gestión de catálogo
- `ticket-printing`: impresión de tickets vía diálogo nativo de impresión (`webContents.print()`)

### Modified Capabilities
None — proyecto nuevo, sin specs previas.

## Approach

**Framework: Electron** (decisión ya cerrada en exploración — ver
`exploration.md`). Resumen de tradeoffs vs Tauri:

| Criterio | Electron | Tauri |
|---|---|---|
| Impresión de tickets | API estable (`webContents.print()`), precedentes de producción en POS | Depende de `window.print()` del WebView, bugs históricos reportados |
| Precedentes reales en POS | Abundantes y maduros | Escasos/no confirmados |
| SQLite embebido | Riesgo bajo **si se elige explícitamente `node:sqlite`** (no `better-sqlite3` compilado desde fuente) | Riesgo bajo por defecto (`tauri-plugin-sql`) |
| CI Windows→Mac | Maduro (`electron-builder` + runner `macos-latest`) | Maduro (`tauri-action` + runner `macos-latest`) |
| Instalador/RAM | Más grande (~80-150MB) | Más liviano |
| Curva de aprendizaje | Todo JS/TS/Node | Requiere Rust en el toolchain |

Electron gana por el criterio decisivo del negocio (impresión confiable de
tickets), a costa de un instalador más pesado — aceptable para instalación
local de un solo cliente.

**Stack**: Electron (main process con `node:sqlite` para acceso a
SQLite, IPC hacia el renderer con `contextIsolation`) + build/firma vía
GitHub Actions con runner `macos-latest` (target `arm64`, opcionalmente
`x64`) + impresión vía `webContents.print()` con CSS de ancho fijo
(58/80mm).

## Affected Areas

| Area | Impact | Description |
|------|--------|--------------|
| `src/main/` | New | Proceso principal Electron, acceso a SQLite (`node:sqlite`), IPC handlers |
| `src/renderer/` | New | UI: ventas, catálogo, caja, créditos, corte del día |
| `db/` | New | Esquema SQLite y migraciones (productos, departamentos, ventas, caja, créditos) |
| `.github/workflows/` | New | Pipeline de build macOS (`macos-latest`) para `.app`/`.dmg` |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| `webContents.print()` sin probar en la Mac/impresora real del cliente | Med | Colchón de tiempo el día de instalación; validar en sitio antes de go-live |
| Elegir `better-sqlite3` compilado desde fuente en vez de `node:sqlite` | Low (mitigado en diseño) | Fijar `node:sqlite` explícitamente en `sdd-design`; documentar versión de Electron/Node |
| Minutos de runner `macos-latest` en GitHub Actions (~10x costo) | Low | Verificar plan de GitHub antes de builds repetidos; limitar CI a releases |
| App sin firma de pago bloqueada por Gatekeeper en primer uso | Low | Documentar bypass manual (clic derecho → Abrir) como parte de la instalación |
| Cálculo de ganancia/corte de caja con lógica financiera sensible a errores | Med | Cubrir con specs Given/When/Then y casos de prueba antes de `sdd-apply` |

## Rollback Plan

- **Build/CI**: si el pipeline de GitHub Actions falla o el runner macOS
  resulta inviable (costo/cuota), fallback es build manual en una Mac
  prestada/alquilada puntualmente — no bloquea el resto del desarrollo.
- **Impresión**: si `webContents.print()` falla en la Mac real, fallback
  documentado en `exploration.md` es exportar el ticket como PDF/HTML e
  imprimir manualmente desde el diálogo nativo de macOS mientras se depura.
- **Datos**: SQLite es un archivo único en disco; antes de cualquier
  migración de esquema se debe copiar el archivo `.sqlite` como backup —
  revertir es restaurar el archivo previo.
- **Release**: cada `.dmg` publicado queda versionado en GitHub Releases;
  si una versión introduce una regresión, reinstalar el `.dmg` anterior no
  requiere cambios de esquema (las migraciones deben ser aditivas).

## Dependencies

- Confirmar modelo exacto de impresora térmica y versión de macOS de la Mac
  del cliente antes de `sdd-design` (bloqueante para validar impresión)
- Cuenta de GitHub con Actions habilitado (runner `macos-latest`)

## Success Criteria

- [ ] Las 9 secciones del "Corte del Día" de referencia se generan correctamente
- [ ] Venta completa (con escáner HID + selección manual) funciona sin internet
- [ ] Ticket imprime en la impresora térmica ya instalada, sin ESC/POS crudo
- [ ] Administrador puede crear/editar departamentos y productos; Usuario no
- [ ] App instala como `.app`/`.dmg` y aparece en Dock/Launchpad
- [ ] Crédito de cliente se registra y su pago se refleja en el corte del día
