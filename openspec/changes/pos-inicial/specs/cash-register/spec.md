# Cash Register Specification

## Purpose

Controla el ciclo de caja: apertura de turno con monto inicial, entradas
de efectivo (ej. cambio), salidas/pagos a proveedores, y conciliación
entre el dinero esperado en caja y el dinero contado físicamente.

## Requirements

### Requirement: Shift Opening with Initial Amount

El sistema MUST requerir la apertura de un turno de caja con un monto
inicial en efectivo antes de permitir registrar ventas. MUST NOT existir
más de un turno abierto simultáneamente.

#### Scenario: Abrir turno correctamente

- GIVEN no hay ningún turno de caja abierto
- WHEN el cajero captura un monto inicial de $500 y confirma
- THEN el turno queda abierto con "inicio de caja" = $500

#### Scenario: Intentar vender sin turno abierto

- GIVEN no hay ningún turno de caja abierto
- WHEN el cajero intenta registrar una venta
- THEN el sistema MUST rechazar la venta y solicitar abrir turno primero

#### Scenario: Intentar abrir un segundo turno

- GIVEN ya existe un turno de caja abierto
- WHEN se intenta abrir otro turno
- THEN el sistema MUST rechazar la apertura hasta cerrar el turno actual

### Requirement: Cash-In Entries

El sistema MUST permitir registrar entradas de efectivo durante el turno
(por ejemplo, entrada de cambio), cada una con monto y motivo.

#### Scenario: Registrar entrada de cambio

- GIVEN un turno abierto
- WHEN el cajero registra una entrada de efectivo de $200 con motivo
  "cambio"
- THEN la entrada queda registrada y suma a "Entradas efectivo" del
  corte del día

### Requirement: Cash-Out to Suppliers

El sistema MUST permitir registrar salidas de efectivo (pagos a
proveedores), cada una con monto, motivo y nombre del proveedor. Cada
salida MUST reducir el efectivo esperado en caja.

#### Scenario: Registrar pago a proveedor

- GIVEN un turno abierto con efectivo disponible
- WHEN el cajero registra una salida de $300 con proveedor "Hielera del
  Puerto" y motivo "compra de hielo"
- THEN la salida queda registrada con monto, proveedor y motivo
- AND el efectivo esperado en caja se reduce en $300

#### Scenario: Salida sin motivo ni proveedor

- GIVEN el cajero intenta registrar una salida sin capturar motivo o
  proveedor
- WHEN confirma la salida
- THEN el sistema MUST rechazar el registro hasta capturar ambos datos

### Requirement: Cash Reconciliation at Close

Al cerrar el turno, el sistema MUST calcular el "dinero esperado en
caja" (inicio de caja + entradas de efectivo + ventas en efectivo −
pagos a proveedores en efectivo) y MUST permitir capturar el "dinero
contado" físicamente, mostrando la diferencia entre ambos.

#### Scenario: Cierre sin diferencia

- GIVEN el dinero esperado calculado es $1,200
- WHEN el cajero captura $1,200 como dinero contado
- THEN el sistema muestra diferencia $0 y permite cerrar el turno

#### Scenario: Cierre con faltante

- GIVEN el dinero esperado calculado es $1,200
- WHEN el cajero captura $1,150 como dinero contado
- THEN el sistema MUST mostrar una diferencia de −$50
- AND MUST permitir cerrar el turno igualmente, dejando constancia de
  la diferencia en el registro del turno
