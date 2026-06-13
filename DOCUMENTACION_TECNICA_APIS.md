# DOCUMENTACIÓN TÉCNICA DE INTEGRACIÓN DE SERVICIOS (APIs)
**Proyecto**: Simulador-Documentador de Carga de Bases de Datos  
**Enfoque**: Arquitectura de Integración Orientada a Servicios (SOA) decoupled.

---

## 1. Introducción y Arquitectura General
El sistema implementa un modelo de desarrollo desacoplado (decoupled architecture) donde:
* El **Frontend** (construido con React, Vite y TypeScript) gestiona la interfaz interactiva, simulaciones de hilos concurrentes en memoria de navegador, carga de archivos y renderizado de resultados.
* El **Backend** (servidor local en puerto 3000 de NodeJS/Python) provee capacidades avanzadas de cómputo computacional en bases de datos: análisis léxico de código DDL SQL/NoSQL, compilación cruzada de lenguajes de definición de datos (DDL), y sintaxis dinámica para inserciones masivas con integridad referencial.

Esta arquitectura expone tres endpoints HTTP REST fundamentales que facilitan la extensión del simulador educativo hacia herramientas reales de despliegue.

---

## 2. Especificación de Endpoints

### 2.1. API de Ingeniería Inversa y Documentación Automatizada
Este endpoint analiza archivos planos subidos por el usuario, infiere el modelo relacional subyacente y genera un reporte en formato PDF listo para descargar.

* **Dirección (URL):** `/api/v1/analyze?format=json`
* **Método HTTP:** `POST`
* **Content-Type:** `multipart/form-data`

#### ¿Qué recibe (Request)?
La petición HTTP transporta un archivo codificado como binario en el cuerpo del formulario (`multipart/form-data`):
* **`file`**: Archivo cargado por el usuario (`.sql`, `.json` o `.txt`).

#### ¿Qué hace internamente el Servidor?
1. **Lectura y Tokenización**: El backend lee el archivo y analiza sintácticamente las instrucciones (sentencias SQL tipo `CREATE TABLE`, arreglos JSON o esquemas de pares clave-valor).
2. **Construcción del AST (Abstract Syntax Tree)**: Extrae de forma estructurada las entidades (tablas), propiedades (columnas, tipos de datos, nulidad, auto-incremento) y metadatos de restricción (Claves Primarias y Claves Foráneas).
3. **Generación de Representación Intermedia (IR)**: Transforma la información analizada a un esquema estructurado estándar en JSON.
4. **Renderizado de Reporte Físico**: Pasa el esquema a un motor de reportes (como PDFKit o similar) para diagramar y compilar un reporte formal en formato PDF con tablas del diccionario de datos y estadísticas del análisis.
5. **Codificación de Salida**: Codifica el archivo PDF resultante a una cadena en formato `Base64` para poder transmitir el archivo binario de forma segura dentro de una respuesta JSON convencional.

#### ¿Qué responde (Response)?
* **Código de respuesta:** `200 OK`
* **Cuerpo de respuesta (JSON):**
  ```json
  {
    "pdfBase64": "JVBERi0xLjQKJcfsj6IK...[Cadena Base64 del archivo PDF]",
    "schema": {
      "tables": [
        {
          "name": "Medicamentos",
          "columns": [
            { "name": "id", "type": "INT", "primaryKey": true, "nullable": false, "autoIncrement": true },
            { "name": "Nombre", "type": "VARCHAR(100)", "primaryKey": false, "nullable": false, "autoIncrement": false },
            { "name": "Precio", "type": "DECIMAL(10,2)", "primaryKey": false, "nullable": true, "autoIncrement": false }
          ]
        }
      ],
      "relations": [
        {
          "fromTable": "Medicamentos",
          "fromColumn": "categoria_id",
          "toTable": "Categorias",
          "toColumn": "id"
        }
      ]
    }
  }
  ```

---

### 2.2. API de Compilación Transversal de Dialectos (Convertidor)
Este componente realiza la migración sintáctica de los esquemas detectados a lenguajes DDL específicos de otras bases de datos.

* **Dirección (URL):** `/convert`
* **Método HTTP:** `POST`
* **Content-Type:** `application/json`

#### ¿Qué recibe (Request)?
Envía la representación del esquema en formato JSON obtenido en el análisis y el nombre del dialecto objetivo.
* **Cuerpo de respuesta (JSON):**
  ```json
  {
    "schema": { ...estructura del esquema obtenido... },
    "targetFormat": "mysql" // Opciones soportadas: "mysql" | "postgresql" | "sqlite" | "mongodb"
  }
  ```

#### ¿Qué hace internamente el Servidor?
1. **Análisis de Tipos de Datos Compatibles**: Mapea los tipos de datos abstractos y longitudes a los tipos primitivos nativos del motor de destino (por ejemplo, convierte un tipo de dato `AUTOINCREMENT` a `SERIAL` en PostgreSQL, o a tipos anidados jerárquicos en MongoDB).
2. **Ensamblado DDL**: Genera programáticamente el código de definición correspondiente:
   * Para dialectos relacionales (`mysql`, `postgresql`, `sqlite`), escribe sentencias `CREATE TABLE` formateadas incluyendo restricciones de llaves primarias, foráneas y nulidades.
   * Para NoSQL (`mongodb`), genera una plantilla estructurada de validadores de esquemas JSON (`$jsonSchema`) o scripts de creación de colecciones.
3. **Manejo de Errores**: Captura tipos incompatibles u omisiones de datos para retornar un error descriptivo en caso de fallas.

#### ¿Qué responde (Response)?
* **Código de respuesta:** `200 OK`
* **Cuerpo de respuesta (JSON):**
  ```json
  {
    "success": true,
    "convertedCode": "CREATE TABLE Medicamentos (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  Nombre VARCHAR(100) NOT NULL,\n  Precio DECIMAL(10,2)\n);"
  }
  ```

---

### 2.3. API de Generación Dinámica de Datos de Prueba (Semillero)
Genera scripts DML de inserciones de registros aleatorios respetando estrictamente la integridad de los datos y dependencias lógicas.

* **Dirección (URL):** `/generate-data`
* **Método HTTP:** `POST`
* **Content-Type:** `application/json`

#### ¿Qué recibe (Request)?
Envía la estructura del esquema e indica el número de registros ficticios requeridos por cada tabla.
* **Cuerpo de respuesta (JSON):**
  ```json
  {
    "schema": { ...estructura del esquema obtenido... },
    "config": {
      "rows": 10 // Número de filas que se inyectarán por cada tabla
    }
  }
  ```

#### ¿Qué hace internamente el Servidor?
1. **Resolución de Grafo de Dependencias (Orden Topológico)**: Analiza las relaciones (Claves Foráneas) entre las tablas y genera un grafo dirigido. Si la tabla `Medicamentos` depende de `Categorias`, el algoritmo procesa primero la tabla `Categorias` para garantizar que existan registros padre antes de rellenar la tabla hija. Esto evita violaciones de integridad relacional en cascada.
2. **Mapeo Semántico de Columnas**: Identifica el nombre y tipo de la columna para generar datos realistas utilizando librerías semánticas (como Faker). Por ejemplo:
   * Una columna llamada `correo` o `email` recibirá un formato `usuario@dominio.com`.
   * Columnas tipo `Precio` recibirán valores numéricos flotantes razonables.
   * Llaves primarias y foráneas se enlazan con IDs generados correlativa o aleatoriamente para garantizar la consistencia referencial.
3. **Compilación de Scripts**: Junta todos los registros simulados en un archivo plano de sentencias `INSERT INTO` (SQL) o comandos de inserción estructurados (para bases documentales como MongoDB).

#### ¿Qué responde (Response)?
* **Código de respuesta:** `200 OK`
* **Cuerpo de respuesta (JSON):**
  ```json
  {
    "sqlScript": "-- Datos ficticios generados de prueba\nINSERT INTO Categorias (id, Nombre) VALUES (1, 'Salud');\nINSERT INTO Medicamentos (id, Nombre, Precio, categoria_id) VALUES (101, 'Aspirina', 4.50, 1);\n..."
  }
  ```
