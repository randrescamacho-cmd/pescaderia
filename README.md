# Pescaderia POS — "Bahia de los Angeles"

App de punto de venta de escritorio, offline-first, para la tienda "Bahia de
los Angeles" (mariscos, souvenirs, ropa y accesorios, juguetes, dulces y
refrescos). Corre 100% sin internet, en una sola Mac, con SQLite local en
disco.

Este README cubre desarrollo local y, sobre todo, el **procedimiento de
instalacion en la Mac del cliente** (Fase 10/11 del plan de este cambio,
`openspec/changes/pos-inicial/`). Para el checklist detallado del dia de
instalacion real, ver [`docs/validacion-sitio.md`](docs/validacion-sitio.md).

## Stack

- Electron `44.3.0` (empaqueta Node `24.20.0`) + React 19 + TypeScript
  estricto
- `node:sqlite` (nativo de Node, sin dependencia externa) para la base de
  datos local
- `electron-vite` para build/dev, `electron-builder` para empaquetar el
  `.dmg`
- `vitest` como test runner (216+ tests, unit + integration contra SQLite
  real, sin mocks de comportamiento)

## Desarrollo local

Requiere Node 24.x (mismo major que empaqueta Electron 44 — ver
`src/main/node-version.ts` para el porque).

```bash
npm install
npm run dev          # levanta main+preload+renderer con hot-reload
```

Otros comandos utiles:

```bash
npx vitest run        # corre toda la suite de tests (216+)
npm run typecheck      # tsc --noEmit (main/preload + renderer, por separado)
npm run build           # typecheck + build de produccion (main/preload/renderer)
npm run build:mac       # build + electron-builder --mac (requiere macOS o CI, ver abajo)
```

**Nota para desarrollo en Windows**: `electron-builder --mac` (empaquetar el
`.dmg`) **solo funciona en macOS o en un runner de CI con macOS** — no se
puede compilar el instalador de Mac desde Windows. El pipeline de CI
(`.github/workflows/build-mac.yml`) existe exactamente por esta razon: la
maquina de desarrollo es Windows, pero el cliente final usa una Mac.

## Pipeline de CI/CD (GitHub Actions)

Workflow: `.github/workflows/build-mac.yml`, runner `macos-latest`.

| Trigger | Que corre |
|---|---|
| Push a `main` | Job `test`: instala dependencias, `npx vitest run` (216+ tests), `npm run build`. **No empaqueta `.dmg`.** |
| Tag `v*.*.*` (ej. `v1.0.0`) | `test` + job `package`: si (y solo si) los tests pasan, compila y empaqueta el `.dmg` firmado (ad-hoc) para `arm64` y `x64`, lo sube como artifact del workflow y lo publica en GitHub Releases. |
| `workflow_dispatch` (boton manual en la pestana Actions) | Corre el mismo flujo que el trigger que se elija (rama o tag) manualmente. |

**El pipeline SIEMPRE falla si algun test esta roto** — el job `package`
depende de `test` (`needs: test`), asi que un `.dmg` nunca se genera ni se
publica si la suite de `vitest` no pasa completa.

**Sin firma de pago de Apple Developer Program** (99 USD/ano, fuera de
scope — ver `openspec/changes/pos-inicial/proposal.md` "Out of Scope" y
`design.md` Decision 8). El pipeline SI aplica una **firma ad-hoc gratuita**
(`codesign --force --deep --sign -`) sobre el `.app` antes de empaquetar el
`.dmg` — esto es obligatorio en Apple Silicon (sin ella, macOS mata el
proceso con `SIGKILL` sin ningun dialogo posible), pero es distinto de la
firma pagada/notarizada de Apple. La consecuencia practica es el paso de
Gatekeeper descrito abajo, que el usuario final debe hacer **una sola vez**.

**Para publicar una version nueva al cliente**:

```bash
git tag v1.0.0
git push origin v1.0.0
```

Esto dispara el pipeline completo. Confirmar en la pestana **Actions** de
GitHub que el workflow `build-mac` termino en verde, y descargar el `.dmg`
desde la seccion **Releases** del repo (uno por arquitectura:
`PescaderiaPOS-<version>-arm64.dmg` y `PescaderiaPOS-<version>-x64.dmg`).

> **Limite de esta confirmacion**: este README documenta el pipeline tal
> como quedo escrito y con la sintaxis YAML validada localmente (con
> `js-yaml`), pero **no hay forma de confirmar desde esta sesion que el
> runner real de GitHub Actions macOS ejecuto el workflow con exito** — eso
> requiere revisar la pestana Actions del repositorio real
> (`https://github.com/randrescamacho-cmd/pescaderia/actions`) despues de
> hacer push/tag, con acceso humano al navegador. Confirmarlo es el
> siguiente paso pendiente para quien retome este proyecto.

## Instalacion en la Mac del cliente (dia D)

No hay certificado de Apple Developer Program — esto significa que macOS
bloquea la primera apertura de la app con Gatekeeper (pantalla de
"no se puede abrir porque proviene de un desarrollador no identificado" o
similar). Es una friccion de un solo evento; despues de desbloquearla una
vez, la app abre normalmente (doble clic) para siempre.

1. **Descargar el `.dmg`** desde la seccion Releases del repo de GitHub
   (o transferirlo por USB/AirDrop si no hay internet disponible en el
   sitio — la app en si no lo necesita, solo la descarga inicial).
   Elegir el archivo que corresponda al chip de la Mac del cliente:
   - Mac con Apple Silicon (M1/M2/M3/M4...): `PescaderiaPOS-<version>-arm64.dmg`
   - Mac con Intel: `PescaderiaPOS-<version>-x64.dmg`
   - Si no se esta seguro: menu Apple > "Acerca de esta Mac" > "Chip" o
     "Procesador".
2. **Abrir el `.dmg`** (doble clic) — se abre una ventana con el icono de
   la app.
3. **Arrastrar el icono de la app a la carpeta `Applications`** (el `.dmg`
   incluye el acceso directo a esa carpeta).
4. **Expulsar el `.dmg`** (clic derecho sobre el volumen montado en el
   Escritorio o en Finder > "Expulsar").
5. **Bypass de Gatekeeper (SOLO la primera vez)**:
   - Ir a `/Applications` (o Launchpad), buscar "PescaderiaPOS".
   - **Clic derecho (o Control+clic) sobre el icono → "Abrir"** — NO doble
     clic normal, eso mostraria el bloqueo sin opcion de continuar.
   - macOS muestra un dialogo de advertencia; confirmar el boton
     **"Abrir"** (o "Abrir de todos modos", segun la version de macOS).
   - Si el boton no aparece en ese dialogo: ir a **Configuracion del
     Sistema (o Preferencias del Sistema) → Privacidad y Seguridad →
     seccion Seguridad**, y buscar el boton **"Abrir de todos modos"**
     junto al nombre de la app bloqueada.
   - Alternativa por Terminal (si nada de lo anterior aparece):
     ```bash
     xattr -cr /Applications/PescaderiaPOS.app
     ```
6. **Despues de este primer desbloqueo, la app abre normalmente con doble
   clic para siempre** — no hay que repetir el bypass en cada apertura, ni
   despues de reiniciar la Mac.
7. Continuar con el checklist de validacion en sitio antes de dar por
   terminada la instalacion: [`docs/validacion-sitio.md`](docs/validacion-sitio.md).

## Estructura del proyecto

Ver `openspec/changes/pos-inicial/design.md` ("Estructura de Carpetas") para
el arbol completo documentado, y `openspec/changes/pos-inicial/apply-progress.md`
para el detalle PR-por-PR de que se implemento en cada entrega (PR1-PR5).

## Documentacion del cambio (SDD)

Este proyecto se construyo siguiendo un flujo de Spec-Driven Development.
Todos los artefactos (proposal, specs, design, tasks, apply-progress,
verify-reports) viven en `openspec/changes/pos-inicial/`.
