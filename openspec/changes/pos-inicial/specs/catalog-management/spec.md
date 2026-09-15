# Catalog Management Specification

## Purpose

Administra el catálogo de productos y la lista de departamentos de la
tienda. Cada producto pertenece a exactamente un departamento; los
departamentos son una lista configurable por el Administrador, no una
lista fija en código.

## Requirements

### Requirement: Department Management

El sistema MUST permitir al rol Administrador crear, editar y eliminar
departamentos. El sistema MUST NOT tener departamentos hardcodeados —
la lista completa (incluyendo los ya conocidos: Saldos, Mariscos, Venta
de Pescado, Ropa y Accesorios, Juguetes, Dulces, Sodas, Souvenir, Coca
Cola) MUST
existir como datos en SQLite, no como constantes de código.

#### Scenario: Administrador crea un nuevo departamento

- GIVEN el usuario autenticado tiene rol Administrador
- WHEN captura un nombre de departamento nuevo y confirma
- THEN el departamento queda disponible para asignarse a productos

#### Scenario: Eliminar un departamento con productos asignados

- GIVEN un departamento tiene uno o más productos asignados
- WHEN el Administrador intenta eliminarlo
- THEN el sistema MUST rechazar la eliminación y listar los productos
  que lo bloquean
- AND SHOULD sugerir reasignar esos productos antes de reintentar

#### Scenario: Rol Usuario intenta gestionar departamentos

- GIVEN el usuario autenticado tiene rol Usuario
- WHEN intenta crear, editar o eliminar un departamento
- THEN el sistema MUST rechazar la acción por falta de permisos

### Requirement: Product Definition

El sistema MUST permitir crear y editar productos con: nombre, precio de
venta, departamento asignado y código de barras opcional. El precio de
venta MUST ser mayor a cero.

#### Scenario: Crear producto válido

- GIVEN el Administrador está en la pantalla de catálogo
- WHEN captura nombre, precio de venta positivo y selecciona un
  departamento existente
- THEN el producto se guarda y queda disponible para venta

#### Scenario: Producto sin departamento

- GIVEN el Administrador intenta guardar un producto sin departamento
  seleccionado
- WHEN confirma el guardado
- THEN el sistema MUST rechazar el guardado y solicitar un departamento

### Requirement: Single Fixed Department per Product

Cada producto MUST pertenecer a exactamente un departamento (no es una
etiqueta múltiple). Cambiar el departamento de un producto MUST
reasignarlo por completo, sin dejarlo también asociado al departamento
anterior.

#### Scenario: Reasignar producto a otro departamento

- GIVEN un producto "Camarón" está en el departamento "Mariscos"
- WHEN el Administrador lo reasigna a "Venta de Pescado"
- THEN las ventas futuras de "Camarón" cuentan para "Venta de Pescado"
- AND las ventas históricas ya registradas conservan el departamento
  que tenían al momento de la venta

### Requirement: Product Cost and Missing-Cost Handling

El sistema SHOULD permitir capturar un costo por producto, adicional al
precio de venta. Si un producto no tiene costo capturado, el sistema
MUST tratar su costo como 0 para el cálculo de "Ganancia del día"
(Ver `daily-report`), y MUST señalar visiblemente en ese reporte cuántos
productos vendidos ese día no tienen costo capturado.

(Razón de la decisión: excluir la venta del cálculo de ganancia haría
que "Ventas totales" y "Ganancia del día" queden inconsistentes entre
sí — la venta ya cuenta en ventas totales. Tratar el costo faltante
como 0 mantiene la consistencia aritmética, a costa de sobreestimar la
ganancia en esos productos; la señal visible existe para que el
Administrador corrija el catálogo en vez de confiar ciegamente en una
ganancia inflada.)

#### Scenario: Producto vendido sin costo capturado

- GIVEN el producto "Souvenir llavero" no tiene costo capturado
- WHEN se vende una unidad ese día
- THEN el cálculo de "Ganancia del día" usa costo 0 para esa línea
- AND el "Corte del Día" MUST mostrar una advertencia indicando que
  hay productos sin costo capturado

#### Scenario: Producto vendido con costo capturado

- GIVEN el producto "Camarón" tiene costo capturado de $80 y precio de
  venta de $120
- WHEN se vende una unidad
- THEN la ganancia de esa línea es $40
