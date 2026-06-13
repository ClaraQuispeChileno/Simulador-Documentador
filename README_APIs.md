# Documentación de APIs (Integración de Servicios)

Esta guía documenta los endpoints de la API (por defecto en `http://localhost:3000`) consumidos por el Simulador de Base de Datos para analizar archivos, convertir esquemas y generar datos ficticios de prueba.

---

## 1. Analizar Esquema y Generar Documentación (PDF)
Analiza un archivo subido (SQL, JSON, TXT) e infiere la estructura de la base de datos (tablas, columnas, llaves, tipos de datos) además de generar un reporte técnico en formato PDF codificado en Base64.

* **Endpoint:** `/api/v1/analyze?format=json`
* **Método:** `POST`
* **Content-Type:** `multipart/form-data`

### Solicitud (Request)
| Campo | Tipo | Ubicación | Descripción |
| :--- | :--- | :--- | :--- |
| `file` | Archivo | Form-Data | El archivo de base de datos a analizar (`.sql`, `.json`, o `.txt`). |

### Respuesta Exitosa (Response)
* **Status Code:** `200 OK`
* **Content-Type:** `application/json`

```json
{
  "pdfBase64": "JVBERi0xLjQKJcfsj6IK...[Cadena Base64 larga del PDF]",
  "schema": {
    "tables": [
      {
        "name": "Medicamentos",
        "columns": [
          {
            "name": "id",
            "type": "INT",
            "primaryKey": true,
            "nullable": false,
            "autoIncrement": true
          },
          {
            "name": "Nombre",
            "type": "VARCHAR(100)",
            "primaryKey": false,
            "nullable": false,
            "autoIncrement": false
          }
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

## 2. Convertir Esquema a Dialectos
Convierte el esquema JSON inferido (obtenido del endpoint de análisis) a sentencias de código DDL compatibles con el motor de base de datos seleccionado.

* **Endpoint:** `/convert`
* **Método:** `POST`
* **Content-Type:** `application/json`

### Solicitud (Request)
```json
{
  "schema": {
    "tables": [
      {
        "name": "Medicamentos",
        "columns": [
          { "name": "id", "type": "INT", "primaryKey": true },
          { "name": "Nombre", "type": "VARCHAR(100)", "nullable": false }
        ]
      }
    ]
  },
  "targetFormat": "mysql"
}
```
* **Formatos de dialecto soportados (`targetFormat`):**
  * `mysql`
  * `postgresql`
  * `sqlite`
  * `mongodb`

### Respuesta Exitosa (Response)
```json
{
  "success": true,
  "convertedCode": "CREATE TABLE Medicamentos (\n  id INT PRIMARY KEY AUTO_INCREMENT,\n  Nombre VARCHAR(100) NOT NULL\n);"
}
```

---

## 3. Generar Datos Ficticios de Prueba
Genera scripts con inserciones de registros aleatorios y coherentes basados en la estructura del esquema e integridad referencial de las tablas.

* **Endpoint:** `/generate-data`
* **Método:** `POST`
* **Content-Type:** `application/json`

### Solicitud (Request)
```json
{
  "schema": {
    "tables": [
      {
        "name": "Medicamentos",
        "columns": [
          { "name": "id", "type": "INT", "primaryKey": true },
          { "name": "Nombre", "type": "VARCHAR(100)" }
        ]
      }
    ]
  },
  "config": {
    "rows": 5
  }
}
```

### Respuesta Exitosa (Response)
```json
{
  "sqlScript": "INSERT INTO Medicamentos (id, Nombre) VALUES (1, 'Paracetamol');\nINSERT INTO Medicamentos (id, Nombre) VALUES (2, 'Ibuprofeno');\n..."
}
```
*(Nota: Si se solicita formato NoSQL como MongoDB, devolverá las consultas correspondientes en sintaxis de comandos JSON / MongoDB).*
