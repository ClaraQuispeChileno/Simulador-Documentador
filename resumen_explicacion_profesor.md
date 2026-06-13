# Resumen Ejecutivo del Proyecto: Integración del Simulador y el Documentador de Base de Datos

Este documento sirve como guía para explicar de manera clara, didáctica y no técnica a un profesor o evaluador el trabajo realizado, los retos complejos que se superaron y el valor académico/técnico de la solución implementada.

---

## 1. El Objetivo del Proyecto
El proyecto consistió en conectar dos sistemas independientes de bases de datos para trabajar como uno solo de forma segura:
1. **El Simulador de Base de Datos (Frontend en React)**: Una interfaz interactiva que permite a los alumnos diseñar esquemas de bases de datos.
2. **El Documentador y Auditor (Backend en Node.js/Python)**: Un motor inteligente encargado de auditar la calidad del diseño de la base de datos, detectar anomalías y generar documentación técnica (incluyendo archivos PDF).

El reto consistía en permitir que el alumno pueda registrarse, guardar sus diseños del simulador directamente en la base de datos centralizada (Supabase) a través de la API del documentador, y navegar de una aplicación a otra con un inicio de sesión único y automático, sin tener que escribir sus credenciales dos veces.

---

## 2. Lo que se implementó (Logros Clave)

### 🔑 Autenticación Unificada y Autologin (Single Sign-On)
* Se integró una ventana de inicio de sesión/registro en el Simulador.
* Se implementó un sistema de **Redirección por Enlaces Mágicos (Magic Links)**. Al hacer clic en *"Ver mis guardados"*, el servidor genera una firma digital temporal única y redirige al alumno al documentador, donde se le inicia sesión automáticamente sin pedir credenciales adicionales.

### 💾 Guardado Centralizado de Reportes
* Se creó una pasarela segura que toma la base de datos diseñada por el alumno, genera automáticamente el reporte de auditoría y lo guarda en Supabase.
* Adicionalmente, el reporte se convierte a formato PDF y se sube automáticamente al almacenamiento en la nube (**Supabase Storage**), asociando el enlace del PDF al registro del usuario para su posterior descarga o visualización.

### 🔄 Convertidor de Esquemas Multi-dialecto
* Se extendió el convertidor local basado en Python para que el simulador soporte múltiples dialectos y tecnologías de bases de datos: **MySQL, PostgreSQL, SQLite, MongoDB, JSON Schema, JSON Crack, Prisma, GraphQL y YAML**.

---

## 3. Los Desafíos Más Complicados y Cómo se Resolvieron

### 🛡️ Desafío 1: El problema de seguridad de la base de datos (RLS)
* **El Problema**: Supabase utiliza políticas de seguridad a nivel de fila (Row-Level Security o RLS). Si el simulador frontend intentara escribir directamente en la base de datos, tendríamos que haber expuesto claves secretas administrativas en el cliente, lo cual es un fallo de seguridad crítico.
* **La Solución**: Creamos un **Proxy de API en el Backend**. El simulador envía los datos al backend (Node.js) de forma segura. El backend, actuando como un intermediario de confianza, utiliza una clave administrativa segura de servidor (`service_role`) para guardar los datos e imágenes PDF en Supabase, protegiendo las credenciales.

### 🏎️ Desafío 2: La carrera de tiempos de Supabase en el Navegador (Race Condition)
* **El Problema**: Al usar enlaces mágicos para el autologin, Supabase lee las credenciales que viajan en la dirección web (el hash `#access_token=...`) y las borra inmediatamente para que nadie las robe. Si la página tardaba unos milisegundos en cargar, el script de inicio de sesión ya no encontraba el token porque el navegador lo había limpiado antes.
* **La Solución**: Añadimos un script interceptor ultra rápido en la cabecera (`<head>`) del HTML. Este script captura las credenciales del enlace antes de que Supabase o cualquier otro script puedan borrarlas, garantizando un inicio de sesión 100% fiable en producción.

### 📊 Desafío 3: El renderizado de la barra de progreso en el PDF
* **El Problema**: El auditor genera una barra de progreso que califica el diseño de la base de datos (ej: `[████████░░] 85%`). Sin embargo, las tipografías estándar para generar PDFs (`Helvetica`) no soportan esos caracteres de bloques unicode. El resultado era que el PDF mostraba caracteres corruptos extraños (como `%%%%%%^%^%^+`).
* **La Solución**: Modificamos el generador de PDF (`pdfHelper.js`) para interceptar cualquier línea que contenga la estructura de la barra de progreso. En lugar de imprimir texto corrupto, el backend dibuja mediante programación vectores y rectángulos de colores reales en el PDF (gris para el fondo, azul para el relleno activo) junto al texto de calificación, logrando un diseño visual óptimo y profesional.

### 🌐 Desafío 4: Redirecciones en la nube y el protocolo HTTPS (Vercel)
* **El Problema**: En la nube (Vercel), las aplicaciones corren detrás de proxies que redirigen el tráfico de forma interna usando el protocolo inseguro (`http`). Express detectaba esto y le enviaba a Supabase una URL de redirección insegura. Supabase la rechazaba por motivos de seguridad al no coincidir con la URL segura configurada (`https://...`), y mandaba al usuario de vuelta a `localhost:3000`.
* **La Solución**: Modificamos la detección del protocolo del servidor para leer cabeceras de proxy (`x-forwarded-proto`), garantizando que la URL de redirección generada sea siempre en formato seguro `https` en producción, solucionando el problema.

### 📱 Desafío 5: Evitar cuelgues (pantallas negras) en el Frontend por datos dinámicos
* **El Problema**: Algunos dialectos NoSQL (como MongoDB o JSON Schema) devuelven el esquema convertido como estructuras complejas de objetos (diccionarios), a diferencia de SQL que devuelve texto simple. React no permite renderizar objetos directos en el DOM y causaba una caída de la aplicación que dejaba la pantalla en negro al usuario.
* **La Solución**: Implementamos validaciones preventivas en ambos lados. El backend serverless serializa las conversiones a texto y el frontend valida el tipo de dato mediante un `typeof` preventivo. Si detecta una estructura de datos de tipo objeto, le aplica un formateo `JSON.stringify` automático antes de renderizarla en pantalla.
