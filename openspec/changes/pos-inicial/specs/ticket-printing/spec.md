# Ticket Printing Specification

## Purpose

Imprime tickets de venta y el Corte del Día usando el diálogo nativo de
impresión de macOS (`webContents.print()`), en papel de 80mm, sin
comandos ESC/POS crudos, aprovechando que la impresora térmica ya está
instalada como impresora normal del sistema.

## Requirements

### Requirement: Native Print Dialog, No Raw ESC/POS

El sistema MUST imprimir usando el diálogo de impresión nativo del
sistema operativo (`webContents.print()` en Electron) sobre la
impresora ya instalada. El sistema MUST NOT enviar comandos ESC/POS
crudos por USB o puerto serial.

#### Scenario: Imprimir ticket de venta

- GIVEN una venta fue cerrada exitosamente
- WHEN el cajero solicita imprimir el ticket
- THEN el sistema MUST invocar el diálogo nativo de impresión de macOS
  con el contenido del ticket renderizado en HTML

#### Scenario: Cancelar impresión desde el diálogo nativo

- GIVEN el diálogo nativo de impresión está abierto
- WHEN el usuario lo cancela
- THEN la venta y sus datos MUST permanecer guardados sin cambios —
  cancelar la impresión no revierte la venta

### Requirement: 80mm Paper Width

El HTML del ticket MUST usar CSS `@page { size: 80mm auto; margin: 0 }`
(o equivalente) para ajustarse al ancho del papel térmico instalado.

#### Scenario: Ticket de venta con líneas largas

- GIVEN una venta con un nombre de producto largo
- WHEN se renderiza el ticket para impresión
- THEN el contenido MUST ajustarse al ancho de 80mm sin recortar
  información crítica (nombre, cantidad, precio, total)

### Requirement: Print Sale Receipts and Daily Report

El sistema MUST poder imprimir dos tipos de documento con este mismo
mecanismo: el ticket de una venta individual, y el ticket del Corte del
Día (ver `daily-report`) con sus 9 secciones en el orden definido.

#### Scenario: Imprimir Corte del Día al cerrar turno

- GIVEN un turno de caja fue cerrado y el Corte del Día fue calculado
- WHEN el Usuario o Administrador solicita imprimirlo
- THEN el sistema MUST generar el HTML de 80mm con las 9 secciones e
  invocar el diálogo nativo de impresión

#### Scenario: Impresora no disponible o desconectada

- GIVEN la impresora térmica no aparece en la lista de impresoras del
  sistema
- WHEN se solicita imprimir un ticket
- THEN el sistema SHOULD informar el error mostrado por el diálogo
  nativo del sistema y MUST permitir reintentar sin perder los datos
  ya calculados/guardados
