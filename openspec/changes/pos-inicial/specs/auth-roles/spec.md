# Auth Roles Specification

## Purpose

Controla el acceso a la aplicación mediante dos roles con PIN
compartido (no cuentas individuales por empleado), determinando qué
acciones puede realizar cada rol.

## Requirements

### Requirement: Two Shared-PIN Roles

El sistema MUST definir exactamente dos roles: `usuario` (cajero) y
`administrador`, cada uno con un único PIN compartido por rol. El
sistema MUST NOT requerir ni almacenar identidad individual por
empleado.

#### Scenario: Ingresar con PIN de Usuario

- GIVEN la app está en pantalla de bloqueo/login
- WHEN se captura el PIN configurado para el rol Usuario
- THEN la sesión inicia con permisos de Usuario

#### Scenario: PIN incorrecto

- GIVEN la app está en pantalla de bloqueo/login
- WHEN se captura un PIN que no coincide con ninguno de los dos roles
- THEN el sistema MUST rechazar el acceso y permanecer en login

### Requirement: Administrator-Only Actions

El sistema MUST restringir al rol `administrador` las acciones de:
crear/editar/eliminar departamentos y crear/editar/eliminar productos
del catálogo.

#### Scenario: Usuario intenta editar un producto

- GIVEN la sesión activa tiene rol Usuario
- WHEN intenta editar el precio de un producto del catálogo
- THEN el sistema MUST rechazar la acción por falta de permisos

#### Scenario: Administrador edita un producto

- GIVEN la sesión activa tiene rol Administrador
- WHEN edita el precio de un producto del catálogo
- THEN el sistema MUST aplicar el cambio

### Requirement: Usuario Role Permitted Actions

El rol `usuario` MUST poder registrar ventas y realizar apertura/corte
de caja, sin necesidad de PIN de Administrador.

#### Scenario: Usuario realiza una venta y corte de caja

- GIVEN la sesión activa tiene rol Usuario
- WHEN registra una venta y posteriormente cierra el turno de caja
- THEN ambas acciones MUST completarse sin solicitar el PIN de
  Administrador

### Requirement: PIN Change Restricted to Administrator

El sistema MUST permitir cambiar los PIN de ambos roles únicamente
desde una sesión con rol Administrador activo.

#### Scenario: Cambiar el PIN de Usuario

- GIVEN la sesión activa tiene rol Administrador
- WHEN captura un nuevo PIN para el rol Usuario y confirma
- THEN el PIN anterior del rol Usuario deja de funcionar y el nuevo
  PIN concede acceso como Usuario
