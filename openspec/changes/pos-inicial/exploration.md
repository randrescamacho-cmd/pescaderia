# Exploration: Tauri vs Electron — POS "Bahía de los Ángeles" (pos-inicial)

## Current State

Proyecto nuevo, carpeta vacía salvo artefactos SDD (`openspec/config.yaml`,
`openspec/changes/pos-inicial/state.yaml`). No existe código previo. El
"sistema actual" a reemplazar es un POS de escritorio (probablemente Windows)
del cual solo se tiene un ticket físico de "Corte del Día" como especificación
funcional de referencia — no hay acceso al código ni a la base de datos de ese
sistema.

Decisión ya cerrada por el usuario (no reabrir): app de escritorio con Tauri o
Electron + SQLite en disco, en lugar de PWA/IndexedDB, por riesgo de pérdida
de datos de un negocio real sin internet confiable.

## Affected Areas

No aplica (proyecto nuevo). Esta exploración alimenta directamente
`sdd-propose` y sobre todo `sdd-design`, donde se debe fijar: framework
elegido, estrategia de SQLite embebido, estrategia de build/CI para macOS, y
estrategia de impresión.

## Investigación por pregunta

### 1. Build cruzado sin Mac física (Windows dev → macOS target)

Ni Tauri ni Electron soportan cross-compilación real y confiable de
Windows → macOS para módulos nativos. La práctica estándar de la industria es
usar **GitHub Actions con un runner `macos-latest` que compila NATIVAMENTE en
macOS**, no cross-compilar desde el runner Windows. Esto aplica a ambos
frameworks por igual: el repo vive en GitHub (desarrollado desde Windows),
pero el job de build para Mac corre en una VM macOS real que GitHub provee.

- **Tauri**: `tauri-apps/tauri-action` tiene templates listos con matrix que
  incluye `macos-latest` y targets `aarch64-apple-darwin` (Apple Silicon) y
  `x86_64-apple-darwin` (Intel), sin necesidad de secretos de firma si se
  acepta un build sin firmar.
- **Electron**: `electron-builder` documenta oficialmente el mismo patrón de
  matrix build (`macos-latest`, `windows-latest`, `ubuntu-latest`).
- **Conclusión**: equivalentes en dificultad de CI — la diferencia real está
  en el módulo nativo de SQLite (punto 2), no en el CI de la app en sí.

**Apple Silicon vs Intel**: Apple completó la transición a Apple Silicon en
2023; ningún Mac nuevo se vende con Intel desde entonces. macOS Tahoe (macOS
26, otoño 2025) es la última versión mayor que soporta Macs Intel. Para 2026,
la inmensa mayoría de Macs en uso activo son Apple Silicon (arm64).
**Recomendación**: targetear `aarch64-apple-darwin` como prioridad; incluir
`x86_64-apple-darwin` también es barato (mismo workflow) si no se puede
confirmar el modelo exacto del cliente.

**Firma y notarización** — dos mecanismos distintos de macOS:

1. **Firma ad-hoc (obligatoria en Apple Silicon)**: sin al menos una firma
   ad-hoc (gratuita, automática, generada por el toolchain de build) macOS
   mata el proceso con `SIGKILL` — sin diálogo de "abrir de todos modos" para
   este caso. Tanto Tauri como Electron aplican esta firma automáticamente
   como parte normal del build, sin costo ni cuenta de Apple Developer.
2. **Gatekeeper / cuarentena de archivos descargados**: sin certificado de
   Apple Developer Program (99 USD/año) + notarización, Gatekeeper bloquea la
   apertura de un archivo que llegó por descarga/USB/AirDrop. Vía de escape
   para un solo cliente: click derecho → Abrir (o Configuración → Privacidad y
   Seguridad → "Abrir de todos modos"), o `xattr -cr /ruta/App.app` desde
   Terminal.

**Implicación para este caso**: NO firmar con certificado pagado es razonable
para una instalación de un solo cliente. Costo: una fricción de UX de un solo
evento el día de instalación (un click derecho → Abrir). Después de ese primer
desbloqueo, la app abre normalmente para siempre. No justifica pagar 99
USD/año solo para evitar un click. Idéntico en Tauri y Electron — no es
diferenciador entre frameworks.

### 2. SQLite embebido — aquí SÍ hay diferencia real de riesgo

**Tauri**: `tauri-plugin-sql` (v2.4.0) usa `sqlx` internamente y expone la
base de datos directamente al frontend JS/TS (`Database.load('sqlite:pos.db')`),
sin necesidad de escribir comandos Rust para el CRUD básico — reduce la curva
de Rust que normalmente se le atribuye a Tauri. La lógica de negocio (ganancia
del día, corte de caja) puede vivir enteramente en TypeScript. Como el build
de macOS corre en runner macOS real (no cross-compilado desde Windows),
compilar el crate Rust no es un problema práctico distinto a compilar
cualquier otro crate.

**Electron**, tres caminos:
- `better-sqlite3` (más popular, mejor rendimiento, API sincrónica):
  **confirmado que NO soporta cross-compilación confiable Windows→macOS** —
  módulo nativo N-API que debe compilarse (o descargarse precompilado) por
  arquitectura/OS. Mitigación estándar: `electron-builder install-app-deps`,
  que descarga binarios N-API precompilados por plataforma en vez de
  compilar desde fuente — funciona bien en runner CI macOS.
- `node:sqlite` (built-in de Node.js desde v22.5, release candidate/estable
  ~Node 25.7): viene incluido en el runtime que Electron empaqueta, sin
  compilar ni instalar nada — elimina el problema de módulos nativos
  cross-plataforma. Contra: relativamente nuevo, y solo accesible desde el
  proceso principal (main process) — el renderer necesita IPC, que de todas
  formas es la arquitectura recomendada en Electron por seguridad
  (`contextIsolation`).
- `sqlite3` (node-sqlite3, más antiguo): compila mejor cross-plataforma que
  `better-sqlite3` históricamente, pero más lento y menos mantenido.

**Riesgo comparado**: Electron con `better-sqlite3` compilado desde cero tiene
el riesgo documentado más alto (issues abiertos sobre fallos de
cross-compilación). Ese riesgo se elimina casi por completo con `node:sqlite`
o binarios N-API precompilados sobre runner macOS real. Tauri con
`tauri-plugin-sql` no tiene este riesgo porque el ecosistema Cargo maneja la
compilación por-target de forma más uniforme.

**Conclusión**: con las mitigaciones correctas, ambos llegan a riesgo bajo y
comparable. Tauri llega ahí "por defecto"; Electron requiere elegir
deliberadamente `node:sqlite` en vez de `better-sqlite3` compilado desde
fuente — decisión de diseño explícita a documentar, no un bloqueo.

### 3. Impresión (diálogo nativo del sistema, sin ESC/POS crudo)

Ambos frameworks pueden invocarlo, con madurez distinta:

- **Electron**: `webContents.print()` es API oficial y estable, con soporte
  documentado para imprimir background/CSS y `silent: true/false`. Riesgo
  conocido: un cambio reciente de Chromium (impresión "out-of-process" en
  macOS, 2025) rompió temporalmente el prellenado de opciones en el diálogo
  nativo en macOS — ya parcheado en versiones recientes de Electron, pero
  evidencia de que hay que vigilar el subsistema en cada actualización. Para
  tickets angostos (58/80mm), viable directamente con
  `@page { size: 80mm auto; margin: 0 }` en CSS estándar.
- **Tauri**: NO tiene API de impresión propia — depende de que el WebView
  nativo (WKWebView en macOS) soporte `window.print()`. Históricamente
  inconsistente según issues abiertos en el repo oficial (`window.print() not
  working` #3066; pedido de API de impresión #4917; falta de opciones de
  márgenes #6202). Existen plugins community (`tauri-plugin-printer`,
  `tauri-plugin-printer-wkhtml-bin`) para cubrir el hueco, el segundo depende
  de empaquetar `wkhtmltopdf.exe` — dependencia orientada a Windows, no
  confirmada como igual de sólida en macOS.

**Diferenciador real para este proyecto**: dado que la impresora térmica ya
aparece como impresora normal con driver/CUPS en la Mac del cliente, lo que se
necesita es disparar el diálogo de impresión nativo con un HTML angosto —
mejor soportado en Electron (`webContents.print()`, patrón establecido con
`electron-pos-printer`) que en Tauri (dependencia de `window.print()` del
WebView, con historial de bugs). Punto a favor concreto de Electron.

**Riesgo pendiente**: el comportamiento exacto de `window.print()` /
`webContents.print()` en la versión específica de macOS y el modelo exacto de
impresora del cliente no se puede confirmar sin probarlo en la Mac real —
riesgo de "no testeable hasta el día D", independiente del framework, aunque
más agudo en Tauri por la menor madurez documentada.

### 4. Escáner USB-HID

Hecho de arquitectura de sistema operativo, no de framework: un escáner en
modo "HID keyboard emulation" es reconocido por macOS a nivel de driver de
teclado, antes de que cualquier app reciba el evento. Para la app es
indistinguible de alguien tecleando rápido + Enter. No requiere integración
especial en ninguno de los dos frameworks — basta un `<input>` con foco o un
listener de `keydown` a nivel de documento. Sin diferenciador entre
frameworks.

### 5. Empaquetado "se siente instalado"

Ambos producen un `.app` bundle estándar de macOS empaquetado en un `.dmg`.
Al arrastrar el `.app` a `/Applications`, aparece en Launchpad y, al abrirlo,
en el Dock — sin barra de navegador ni URL visible. Cierto para ambos por
igual (`tauri-apps/tauri-bundler` vs `electron-builder`/`electron-forge`).
Sin diferenciador entre frameworks.

### 6. Precedentes reales

- **Electron**: evidencia abundante y madura de POS reales en producción —
  `Store-POS` (React + Express + SQLite, multi-terminal LAN), `Tayssir POS`
  (Electron + React + Sequelize + PostgreSQL), y `electron-pos-printer`
  (miles de usos reportados, soporte de 44mm a 80mm, incluye comando de
  apertura de cajón de dinero). "POS con Electron" es un patrón muy trillado.
- **Tauri**: no se encontraron POS reales de producción documentados con la
  misma profundidad — Tauri es más joven (v1 2022, v2 estable 2024) y su
  tracción en retail/comercio con impresión térmica es notablemente menor.

### 7. Recomendación

**Electron**, para este caso específico.

| Criterio | Electron | Tauri | Gana |
|---|---|---|---|
| CI cruzado Windows→Mac vía GitHub Actions | Maduro (`electron-builder`) | Maduro (`tauri-action`) | Empate |
| Firma/notarización para 1 cliente | Ad-hoc + bypass manual | Igual | Empate |
| SQLite embebido | Riesgo bajo SI se elige `node:sqlite` (decisión explícita) | Riesgo bajo por defecto | Tauri (leve) |
| Impresión de tickets | API estable de primera clase, precedentes de producción | Depende de `window.print()`, bugs reportados | **Electron (fuerte)** |
| Escáner USB-HID | Sin diferenciador | Sin diferenciador | Empate |
| "Se siente instalado" | Sin diferenciador | Sin diferenciador | Empate |
| Precedentes reales en POS | Abundantes y maduros | Escasos/no confirmados | **Electron (fuerte)** |
| Tamaño instalador / RAM | Grande (~80-150MB) | Pequeño (WebView del sistema) | Tauri |
| Curva de aprendizaje | Todo JS/TS/Node | Requiere Rust en el toolchain de build | Electron |

El criterio decisivo es la **impresión de tickets** — función crítica y no
negociable (el ticket de "Corte del Día" existe porque hoy se imprime en
papel) — combinada con la ausencia de precedentes de producción en Tauri para
este dominio exacto. Para un negocio real sin margen para "vamos a ver si
`window.print()` se porta bien en una versión de macOS nunca antes probada",
la madurez de `webContents.print()` y el patrón `electron-pos-printer`
reducen sustancialmente el riesgo de ejecución.

**Qué se sacrifica al no elegir Tauri**: instalador más pequeño y menor uso de
RAM en reposo (irrelevante para instalación local de un solo cliente), y una
superficie de seguridad más restringida por defecto (mitigable en Electron
moderno con `contextIsolation` + `preload` scripts). Ninguno es crítico para
un POS interno de un solo cliente sin exposición a red pública.

## Risks

- El comportamiento exacto de `webContents.print()` en la versión específica
  de macOS y el modelo exacto de impresora térmica del cliente no puede
  confirmarse sin probarlo en la Mac real — planear colchón de tiempo el día
  de instalación para depurar impresión en sitio.
- Si se elige Electron, la decisión de diseño DEBE especificar explícitamente
  `node:sqlite` o binarios N-API precompilados vía
  `electron-builder install-app-deps` — NO dejarlo implícito, para evitar el
  riesgo documentado de `better-sqlite3` compilado desde fuente.
- Los runners `macos-latest` de GitHub Actions consumen minutos a tasa
  multiplicada (~10x) en repos privados — verificar plan de GitHub y costo
  esperado de builds repetidos antes de diseñar el pipeline de CI.
- No se pudo verificar el modelo exacto de impresora térmica ni la versión
  exacta de macOS de la Mac del cliente — confirmar antes o durante el día de
  instalación; no asumir una versión específica de macOS en el diseño.
- Verificar la versión exacta de Node.js empaquetada por la versión de
  Electron elegida (para confirmar disponibilidad/estabilidad de
  `node:sqlite`) al fijar versión de Electron en `sdd-design`/`sdd-tasks`.

## Ready for Proposal

Sí. Recomendación para alimentar `sdd-propose`: **Electron** + SQLite vía
`node:sqlite` (o binarios N-API precompilados como plan B), build para macOS
vía GitHub Actions `macos-latest` targeteando Apple Silicon (arm64) como
prioridad y opcionalmente Intel (x64), sin firma de pago de Apple Developer
Program (bypass manual de Gatekeeper aceptable para un solo cliente), e
impresión de tickets vía `webContents.print()` con HTML/CSS de ancho fijo
(58/80mm).
