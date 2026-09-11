# Daily Report ("Corte del Día") Specification

## Purpose

Calcula y renderiza el reporte de cierre de operación diaria,
reproduciendo exactamente las secciones, el orden y los rubros del
ticket físico de referencia del sistema actual.

## Requirements

### Requirement: Fixed Section Order

El Corte del Día MUST presentar exactamente estas secciones, en este
orden: (1) Entradas efectivo, (2) Ventas de contado, (3)
Salidas/Proveedores, (4) Dinero en caja, (5) Dinero en bancos, (6)
Ventas totales, (7) Ganancia del día, (8) Pagos de créditos, (9) Ventas
por departamento.

#### Scenario: Generar corte con datos del día

- GIVEN un turno de caja abierto y cerrado con ventas, entradas y
  salidas registradas ese día
- WHEN se genera el Corte del Día
- THEN el reporte MUST mostrar las 9 secciones en el orden definido, sin
  omitir ninguna aunque su valor sea cero

### Requirement: Section Formulas

Cada sección MUST calcularse así:

| Sección | Fórmula |
|---|---|
| Entradas efectivo | inicio de caja + entradas de cambio |
| Ventas de contado | efectivo + tarjeta = total |
| Salidas/Proveedores | cada pago a proveedor + total |
| Dinero en caja | entradas efectivo + pagos efectivo − pagos a proveedores = total |
| Dinero en bancos | pagos con tarjeta = total |
| Ventas totales | ventas de contado + pagos de clientes (créditos) = total |
| Ganancia del día | ventas − costos (costo faltante = 0, ver `catalog-management`) |
| Pagos de créditos | cada pago de crédito + total, o "NO HUBO PAGOS" |
| Ventas por departamento | total vendido por cada departamento con ventas ese día |

#### Scenario: Dinero en caja consistente con conciliación de caja

- GIVEN "Entradas efectivo" totalizan $700, ventas en efectivo $900 y
  pagos a proveedores $300
- WHEN se calcula "Dinero en caja"
- THEN el total MUST ser $1,300 ($700 + $900 − $300)

#### Scenario: Ganancia del día con producto sin costo

- GIVEN un producto vendido no tiene costo capturado
- WHEN se calcula "Ganancia del día"
- THEN esa línea MUST usar costo 0 en el cálculo
- AND el reporte MUST incluir una advertencia visible de productos sin
  costo capturado

### Requirement: Departament Breakdown

La sección "Ventas por departamento" MUST desglosar el total vendido
por cada departamento con al menos una venta ese día, usando los
departamentos vigentes al momento de cada venta (ver `catalog-management`).
Departamentos sin ventas ese día MAY omitirse de esta sección.

#### Scenario: Desglose con múltiples departamentos

- GIVEN se vendieron $500 en "Mariscos" y $200 en "Souvenir" hoy
- WHEN se genera el Corte del Día
- THEN la sección "Ventas por departamento" MUST mostrar ambos rubros
  con sus montos

### Requirement: Report Is Per Shift/Day

El Corte del Día MUST calcularse sobre las transacciones del turno de
caja actual (apertura a cierre), no sobre históricos multi-día.

#### Scenario: Generar corte antes de cerrar turno

- GIVEN el turno de caja del día aún está abierto
- WHEN se solicita generar el Corte del Día
- THEN el sistema SHOULD permitir una vista previa con los datos hasta
  ese momento, aclarando que corresponde a un turno todavía abierto
