# Validacion en sitio — dia de instalacion real (Fase 11)

Checklist accionable para el dia que se instala PescaderiaPOS en la Mac real
de la tienda "Bahia de los Angeles". Ninguno de estos pasos es automatizable
(dependen de hardware real: impresora, escaner, la Mac del cliente, y de
desconectar la red real) — por eso es un checklist manual, no un test de
`vitest`. Mapea 1:1 a `openspec/changes/pos-inicial/tasks.md` Fase 11 y a los
Success Criteria del proposal.

Marcar cada casilla `[x]` conforme se complete, EN VIVO durante la visita —
no despues de memoria. Si algo falla, anotar el sintoma exacto antes de
seguir al siguiente punto (para poder reproducirlo despues sin depender de
tener la Mac del cliente enfrente otra vez).

## 0. Antes de llegar al sitio

- [ ] Confirmar que el `.dmg` mas reciente (el tag/version que se va a
      instalar) esta descargado o accesible por USB — no depender de
      internet en el sitio para la descarga (ver README.md, el lugar
      "pierde luz/internet seguido").
- [ ] Llevar el `.dmg` de **ambas** arquitecturas (`arm64` y `x64`) si no se
      ha podido confirmar de antemano el chip exacto de la Mac del cliente.

## 1. Identificar hardware real (tasks.md 11.1)

- [ ] Confirmar el **modelo exacto de la impresora termica** (marca +
      modelo, ej. "Epson TM-T88" o equivalente) y anotarlo.
- [ ] Confirmar la **version de macOS** de la Mac del cliente (menu Apple >
      "Acerca de esta Mac").
- [ ] Verificar que la impresora **aparece en Configuracion del Sistema (o
      Preferencias del Sistema) → Impresoras y escaneres** como una
      impresora normal (con su driver/CUPS nativo, sin necesidad de
      instalar nada adicional — ver `design.md` "Impresion de Tickets").
  - [ ] Si NO aparece: instalar el driver del fabricante ANTES de continuar
        — sin esto, ningun paso de impresion de abajo va a funcionar.

## 2. Instalar la app (usar README.md como guia paso a paso)

- [ ] Seguir el procedimiento completo de "Instalacion en la Mac del
      cliente (dia D)" del `README.md` raiz del repo.
- [ ] **Verificar el bypass de Gatekeeper paso a paso** (tasks.md 11.4):
  - [ ] Confirmar que un DOBLE clic normal en la app recien instalada
        (antes de cualquier bypass) SI muestra el bloqueo de Gatekeeper
        ("no se puede abrir porque proviene de un desarrollador no
        identificado" o equivalente) — esto confirma que estamos probando
        el escenario real del cliente, no una Mac donde ya se desbloqueo
        antes.
  - [ ] Hacer clic derecho (Control+clic) → "Abrir" → confirmar "Abrir" en
        el dialogo. Anotar si aparecio el boton directamente o si hizo
        falta ir a Privacidad y Seguridad → "Abrir de todos modos".
  - [ ] Cerrar la app por completo (Cmd+Q).
  - [ ] Volver a abrir la app con **doble clic normal** (sin clic derecho)
        y confirmar que abre sin ningun bloqueo — esto confirma que el
        desbloqueo es permanente, no hay que repetirlo cada vez.

## 3. Imprimir un ticket de prueba (tasks.md 11.2)

- [ ] Con la app abierta, hacer login (PIN de Usuario o Administrador).
- [ ] Registrar una venta de prueba con **al menos 2 productos reales del
      catalogo** (nombres reales, no "Producto de prueba") para verificar
      que los nombres largos no se cortan en 80mm.
- [ ] Confirmar la venta (pago en efectivo simple, sin dividir, para
      aislar el problema si algo sale mal) y dejar que imprima
      automaticamente (o usar "Reimprimir ticket" si aplica).
- [ ] Revisar el ticket fisico impreso:
  - [ ] El ancho del papel coincide con 80mm (sin texto cortado a los
        lados).
  - [ ] Los nombres de producto largos no se truncan ni se encima con el
        precio/cantidad.
  - [ ] El total y el desglose de pago son legibles y correctos.
- [ ] Si la impresion falla (error de impresora no disponible): confirmar
      que la app **permite reintentar sin perder la venta ya guardada**
      (comportamiento esperado, tasks.md 9.6) — NO se debe re-vender el
      mismo producto para reintentar imprimir.

## 4. Probar el flujo completo de una venta con hardware real (tasks.md 11.3)

- [ ] Si el escaner de codigo de barras USB-HID ya esta disponible en el
      sitio: escanear un producto real con codigo de barras y confirmar
      que se agrega correctamente a la venta (sin necesidad de tocar el
      teclado).
- [ ] Si el escaner AUN no esta disponible: probar el mismo flujo
      buscando el producto por nombre/teclado, y anotar explicitamente
      que el escaner queda pendiente de probar en una visita posterior.
- [ ] Probar una venta con **pago dividido** (ej. parte efectivo, parte
      tarjeta) y confirmar que el modal exige que la suma coincida con el
      total antes de dejar confirmar.
- [ ] Si hay al menos un cliente capturado: probar una venta con una
      porcion a **credito** y confirmar que el saldo del cliente
      (pantalla Creditos) refleja el monto correcto despues de la venta.

## 5. Verificar que la app funciona sin internet (tasks.md 11.5, parcial)

- [ ] **Desconectar Wi-Fi** (o desenchufar el cable de red) de la Mac del
      cliente.
- [ ] Con la red desconectada, repetir: login, agregar productos a una
      venta, confirmar pago, abrir/cerrar turno de caja, imprimir un
      ticket. Confirmar que TODO funciona igual que con internet
      conectado (la app es 100% offline por diseno — este paso es la
      confirmacion final en la Mac real, no solo en teoria).
- [ ] Reconectar la red al terminar esta prueba.

## 6. Verificar la ubicacion del archivo `.sqlite`

- [ ] Con la app cerrada, abrir Finder y navegar (o usar
      `Cmd+Shift+G` → pegar la ruta) a:
      ```
      ~/Library/Application Support/pescaderia-pos/
      ```
- [ ] Confirmar que existe un archivo `.sqlite` dentro de esa carpeta
      (nombre esperado: `pescaderia-pos.sqlite`, mismo patron que
      `%APPDATA%/pescaderia-pos/` en Windows durante desarrollo, ver
      apply-progress.md PR1).
- [ ] Confirmar que el archivo tiene un tamano mayor a 0 bytes y que su
      fecha de modificacion coincide con las ventas/turnos de prueba de
      este checklist (confirma que SI se esta escribiendo en esa
      ubicacion y no en otra).
- [ ] **Recomendacion operativa** (no bloqueante para esta visita): sugerir
      al cliente un respaldo periodico manual de ese archivo (copiarlo a
      una USB o a la nube cuando haya internet) — la app no incluye backup
      automatico (fuera de scope de este cambio).

## 7. E2E completo offline (tasks.md 11.5, cierre)

- [ ] Con la red aun desconectada (o reconectada, segun se decida en
      sitio — anotar cual de las dos): correr el flujo completo end-to-end
      una ultima vez sin interrupciones:
      1. Abrir turno de caja con un monto inicial real.
      2. Registrar al menos 2 ventas reales (una con pago simple, otra con
         pago dividido).
      3. Registrar una entrada y una salida de caja (con motivo/proveedor).
      4. Cerrar el turno y confirmar que el efectivo esperado vs. contado
         coincide con la formula documentada en `design.md`.
      5. Abrir el Corte del Dia de ese turno e imprimir el ticket de
         corte — confirmar que las 9 secciones aparecen en el orden fijo
         esperado y que el ticket impreso es legible en 80mm.
- [ ] Confirmar con la persona que va a operar la caja (cajero/a) que el
      flujo completo tiene sentido para su forma de trabajar — no solo que
      "funciona" tecnicamente.

## Cierre de la visita

- [ ] Anotar cualquier hallazgo (impresora, escaner, macOS, o UX) que NO
      bloquee la entrega pero que valga la pena registrar como mejora
      futura.
- [ ] Confirmar con el cliente que sabe reproducir el bypass de Gatekeeper
      por su cuenta si en el futuro reinstala la app (ej. tras cambiar de
      Mac) — no depender de que alguien tecnico este presente esa vez.
