# Customer Credit Specification

## Purpose

Gestiona el crédito otorgado a clientes ("fiado") dentro de una venta y
los pagos posteriores que abonan a ese crédito, con reflejo obligatorio
en la sección "Pagos de créditos" del Corte del Día.

## Requirements

### Requirement: Grant Credit at Sale Time

El sistema MUST permitir registrar, dentro de una venta (ver
`sales-transactions`), una porción de pago tipo `credito` asociada a un
cliente — ya sea el monto completo de la venta o solo una parte (pago
dividido). El monto de esa porción MUST incrementar el saldo de
crédito pendiente de ese cliente.

#### Scenario: Otorgar crédito a cliente existente (venta completa)

- GIVEN el cliente "Doña Rosa" tiene saldo de crédito $0
- WHEN se registra una venta con una porción `credito` de $250 a su
  nombre
- THEN el saldo de crédito de "Doña Rosa" queda en $250

#### Scenario: Crédito parcial dentro de una venta dividida

- GIVEN el cliente "Don Beto" tiene saldo de crédito $0
- WHEN se registra una venta de $300 con porción `efectivo` de $200 y
  porción `credito` de $100 a su nombre
- THEN el saldo de crédito de "Don Beto" queda en $100

#### Scenario: Registrar cliente nuevo al otorgar crédito

- GIVEN el cliente no existe todavía en el sistema
- WHEN el cajero captura su nombre al cerrar una porción `credito`
- THEN el sistema MUST crear el registro del cliente con saldo inicial
  igual al monto de esa porción

### Requirement: Register Credit Payments

El sistema MUST permitir registrar pagos posteriores de un cliente que
abonen a su saldo de crédito pendiente, con monto y fecha. Cada pago
MUST reducir el saldo de crédito del cliente sin poder dejarlo negativo.

#### Scenario: Pago parcial de crédito

- GIVEN "Doña Rosa" tiene saldo de crédito $250
- WHEN registra un pago de $100
- THEN su saldo de crédito queda en $150

#### Scenario: Pago mayor al saldo pendiente

- GIVEN un cliente tiene saldo de crédito $80
- WHEN se intenta registrar un pago de $100
- THEN el sistema MUST rechazar el pago o limitarlo al saldo pendiente
  ($80), evitando que el saldo quede negativo

### Requirement: Credit Payments Reflected in Daily Report

Todos los pagos de crédito registrados durante el día MUST aparecer en
la sección "Pagos de créditos" del Corte del Día (ver `daily-report`),
listados individualmente con cliente y monto, con un total. Si no hubo
ningún pago de crédito ese día, la sección MUST mostrar literalmente
"NO HUBO PAGOS", igual que el ticket de referencia.

#### Scenario: Día con pagos de crédito

- GIVEN se registraron dos pagos de crédito el día de hoy: $100 y $50
- WHEN se genera el Corte del Día
- THEN la sección "Pagos de créditos" MUST listar ambos pagos y un total
  de $150

#### Scenario: Día sin pagos de crédito

- GIVEN no se registró ningún pago de crédito el día de hoy
- WHEN se genera el Corte del Día
- THEN la sección "Pagos de créditos" MUST mostrar exactamente el texto
  "NO HUBO PAGOS"
