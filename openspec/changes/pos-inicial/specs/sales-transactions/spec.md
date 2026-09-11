# Sales Transactions Specification

## Purpose

Registra ventas compuestas de líneas de producto/cantidad/precio, con
forma de pago efectivo, tarjeta o crédito de cliente, capturadas por
teclado normal o por escáner de código de barras USB-HID.

## Requirements

### Requirement: Sale Composed of Line Items

Una venta MUST estar compuesta de una o más líneas, cada una con
producto, cantidad y precio unitario (tomado del catálogo al momento de
la venta). El subtotal de cada línea MUST ser cantidad × precio unitario.

#### Scenario: Agregar línea de venta

- GIVEN una venta en curso sin líneas
- WHEN el cajero agrega el producto "Refresco" con cantidad 2
- THEN la venta muestra una línea con subtotal = 2 × precio del producto

#### Scenario: Cantidad inválida

- GIVEN el cajero intenta capturar cantidad 0 o negativa en una línea
- WHEN confirma la línea
- THEN el sistema MUST rechazar la línea y solicitar una cantidad mayor
  a cero

### Requirement: Barcode Scanner Input (HID)

El sistema MUST aceptar entrada de código de barras mediante un campo de
texto con foco que reciba los caracteres tecleados rápido por el
escáner USB-HID seguidos de Enter, sin requerir ninguna API o driver
especial — el escáner es indistinguible de tecleo humano rápido.

#### Scenario: Escaneo de producto conocido

- GIVEN el campo de captura de código de barras tiene el foco
- WHEN el escáner envía el código de un producto existente seguido de
  Enter
- THEN el sistema MUST agregar una línea de ese producto con cantidad 1

#### Scenario: Escaneo de código no registrado

- GIVEN el campo de captura de código de barras tiene el foco
- WHEN el escáner envía un código que no corresponde a ningún producto
- THEN el sistema MUST mostrar un aviso de "producto no encontrado" y
  MUST NOT agregar una línea a la venta

### Requirement: Split Payment per Sale

Una venta MUST poder pagarse con una o más porciones de pago (pago
dividido / split-tender), cada una con su propio tipo: `efectivo`,
`tarjeta` o `credito`. La suma de las porciones MUST ser igual al total
de la venta — el sistema MUST rechazar el cierre si la suma no coincide.
Si alguna porción es de tipo `credito`, esa porción MUST estar asociada
a un cliente (ver `customer-credit`) y no requiere cobro inmediato por
ese monto.

#### Scenario: Venta de contado en efectivo (una sola porción)

- GIVEN una venta con líneas y total de $150
- WHEN el cajero registra una porción de pago "efectivo" por $150 y
  confirma
- THEN la venta se registra con una porción `efectivo` de $150

#### Scenario: Venta con pago dividido efectivo + tarjeta

- GIVEN una venta con líneas y total de $200
- WHEN el cajero registra una porción "efectivo" de $80 y una porción
  "tarjeta" de $120
- THEN la venta se registra con ambas porciones y la suma ($200) MUST
  coincidir con el total

#### Scenario: Porciones que no suman el total

- GIVEN una venta con total $200
- WHEN el cajero registra porciones que suman $180
- THEN el sistema MUST rechazar el cierre de la venta hasta que la suma
  de las porciones sea igual al total

#### Scenario: Venta a crédito sin cliente seleccionado

- GIVEN una venta con líneas capturadas
- WHEN el cajero registra una porción "credito" sin elegir un cliente
- THEN el sistema MUST rechazar el cierre de la venta hasta que se
  seleccione o registre un cliente para esa porción

### Requirement: Sale Total Calculation

El total de una venta MUST ser la suma de los subtotales de todas sus
líneas. Una venta sin líneas MUST NOT poder cerrarse.

#### Scenario: Cerrar venta vacía

- GIVEN una venta en curso sin ninguna línea agregada
- WHEN el cajero intenta cerrar la venta
- THEN el sistema MUST rechazar el cierre y solicitar al menos una línea

#### Scenario: Total con múltiples líneas

- GIVEN una venta con línea A ($50) y línea B ($30)
- WHEN el cajero cierra la venta
- THEN el total registrado MUST ser $80
