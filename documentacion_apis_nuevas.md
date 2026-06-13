# Documentación Técnica de las Nuevas APIs y Endpoints

Este documento detalla los endpoints creados en el backend (`BDII_UNIT002`) para permitir la comunicación segura, la autenticación y la sincronización de documentos con el simulador frontend.

---

## 🧭 Resumen de la Arquitectura de APIs
La integración se estructuró bajo un prefijo de ruta `/api/external` para aislar las operaciones de integración de clientes externos (como el simulador). Todas estas rutas interactúan con Supabase a nivel de servidor utilizando privilegios administrativos para proteger las claves de acceso del cliente.

---

## 1. Módulo de Autenticación y Cuentas

### 📥 1.1. Registro de Usuarios Externos
* **Ruta**: `POST /api/external/register`
* **Descripción**: Permite que un alumno se registre desde el simulador de base de datos.
* **Cuerpo de la Petición (JSON)**:
  ```json
  {
    "email": "correo@alumno.com",
    "password": "contraseña_segura",
    "nombres": "Nombre Apellido"
  }
  ```
* **Respuesta de Éxito (Status 200)**:
  ```json
  {
    "success": true,
    "user": { "id": "uuid-usuario", "email": "correo@alumno.com", "nombres": "Nombre Apellido" }
  }
  ```
* **Importancia**: Registra la cuenta tanto en el sistema de autenticación de Supabase como en la tabla personalizada de `perfiles`, asignándole por defecto el rol de `usuario` activo.

---

### 🔑 1.2. Inicio de Sesión Externo
* **Ruta**: `POST /api/external/login`
* **Descripción**: Valida las credenciales del usuario y verifica el estado de su cuenta.
* **Cuerpo de la Petición (JSON)**:
  ```json
  {
    "email": "correo@alumno.com",
    "password": "contraseña_segura"
  }
  ```
* **Respuesta de Éxito (Status 200)**:
  ```json
  {
    "success": true,
    "user": { "id": "uuid-usuario", "email": "correo@alumno.com", "nombres": "Nombre Apellido", "rol": "usuario" }
  }
  ```
* **Importancia**: Bloquea el acceso a usuarios que hayan sido marcados como `suspendidos` en la base de datos de administración y devuelve el perfil con el rol correspondiente.

---

### 🔗 1.3. Enlace de Autologin (Magic Link Redirect)
* **Ruta**: `GET /api/external/autologin?email=correo@alumno.com`
* **Descripción**: Genera una redirección firmada digitalmente para iniciar sesión de forma automática en el documentador.
* **Parámetros**: `email` (string) del usuario logueado en el simulador.
* **Comportamiento**:
  1. El backend valida el correo electrónico.
  2. Llama a la API administrativa de Supabase `auth.admin.generateLink` con tipo `magiclink`.
  3. Genera una URL de retorno que apunta a `/html/login.html` en producción.
  4. Redirige al navegador a la dirección firmada de Supabase, la cual valida el token y concede la sesión al cliente de forma automática.
* **Importancia**: Proporciona una experiencia de inicio de sesión único (Single Sign-On o SSO) entre ambas aplicaciones.

---

## 2. Módulo de Documentos y Persistencia

### 💾 2.1. Guardar Documentación y PDF
* **Ruta**: `POST /api/external/documentos`
* **Descripción**: Almacena el esquema JSON y sube el archivo PDF correspondiente al Storage en la nube.
* **Cabeceras Recomendadas**:
  * `x-user-id`: Identificador de Supabase del usuario.
  * `x-user-email`: Email del usuario (para registro de logs).
* **Cuerpo de la Petición (JSON)**:
  ```json
  {
    "userId": "uuid-usuario",
    "nombre": "Nombre del Esquema",
    "acceso": "Personal",
    "contenido": {
       "schema": { "tables": [...] },
       "metrics": { ... },
       "anomalies": [...]
    },
    "pdfBase64": "JVBERi0xLjQKJc..."
  }
  ```
* **Respuesta de Éxito (Status 200)**:
  ```json
  {
    "success": true,
    "data": [...]
  }
  ```
* **Importancia**: 
  1. Toma la cadena en Base64 del PDF generada en el simulador y la convierte a un buffer binario.
  2. Sube el archivo PDF al bucket `documentos_pdf` de Supabase Storage organizándolo en la carpeta `user_ID/`.
  3. Obtiene la URL pública del archivo PDF.
  4. Guarda el registro del documento en la tabla `documentos`, inyectando el enlace del PDF dentro del campo JSON `contenido` para que pueda consultarse o descargarse desde la app del documentador.

---

## 3. Módulo de Motor y Utilidades de Base de Datos

### 🔄 3.1. Convertidor de Esquema
* **Ruta**: `POST /convert`
* **Descripción**: Convierte un esquema de base de datos a un dialecto o lenguaje específico usando el motor de Python local o serverless.
* **Cuerpo de la Petición (JSON)**:
  ```json
  {
    "schema": { "tables": [...] },
    "targetFormat": "mongodb"
  }
  ```
* **Respuesta de Éxito (Status 200)**:
  ```json
  {
    "success": true,
    "convertedCode": "const mongoose = require('mongoose'); ..."
  }
  ```
* **Formatos soportados**: `mysql`, `postgresql`, `sqlite`, `mongodb`, `json_schema`, `json_crack`, `prisma`, `graphql`, `yaml`.
* **Importancia**: Centraliza las transformaciones de esquemas en el backend de Python/Node.js, aislando al simulador de procesar lógicas de transformación complejas en el cliente.
