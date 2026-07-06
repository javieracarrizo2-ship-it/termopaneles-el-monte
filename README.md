# Proyecto: Termopaneles El Monte - Catálogo de Stock y Consulta Inteligente

Este es el repositorio oficial del MVP de **Termopaneles El Monte**, desarrollado para optimizar la gestión de inventario y facilitar la cotización de vidrios dobles aislantes fijos para clientes residenciales.

---

## Índice
1. [Identificación](#1-identificación)
2. [Resumen Ejecutivo](#2-resumen-ejecutivo)
3. [Problema y Solución](#3-problema-y-solución)
4. [Arquitectura y Flujo de Datos](#4-arquitectura-y-flujo-de-datos)
5. [Las 4 Verticales](#5-las-4-verticales)
6. [Cómo Interactúa el Usuario con la Solución](#6-cómo-interactúa-el-usuario-con-la-solución)
7. [Automatización, Inventario y Prompts](#7-automatización-inventario-y-prompts)
8. [Cómo Correrlo](#8-cómo-correrlo)
9. [Sección Track-Específica (Track A)](#9-sección-track-específica-track-a)
10. [Limitaciones y Próximos Pasos](#10-limitaciones-y-próximos-pasos)
11. [Roles del Equipo](#11-roles-del-equipo)

---

## 1. Identificación
* **Nombre del Proyecto / Grupo**: Termopaneles El Monte
* **Track / Caso**: Track A (Cliente Real), Caso A (Landing Page y Automatización)
* **Tipo de Proyecto**: MVP
* **Cliente**: Termopaneles El Monte
* **Ubicación**: El Monte, Provincia de Talagante, Región Metropolitana, Chile
* **Profesor**: Benjamín Happey
* **Repositorio**: [https://github.com/javieracarrizo2-ship-it/termopaneles-el-monte](https://github.com/javieracarrizo2-ship-it/termopaneles-el-monte)
* **Sitio Desplegado (Producción)**: [https://termopaneles-el-monte.vercel.app](https://termopaneles-el-monte.vercel.app)
* **Integrantes**:
  * **Javiera Carrizo**
  * **Sara Díaz**
  * **Horacio Sánchez**
  * **Raimundo Pérez**
  * **Martín Horta**

---

## 2. Resumen Ejecutivo
Construimos una **landing page dinámica de catálogo** integrada con un **flujo de automatización en n8n** para consultar el inventario de termopaneles fijos en tiempo real y captar leads comerciales por correo electrónico. La solución permite filtrar termopaneles por medida, visualizar sus proporciones mediante una vista previa interactiva, y estimar alternativas que se adapten a la estructura a través de la calculadora de vanos y del planificador de cobertura.

**Métricas y Resultados:**
* El tiempo de respuesta comercial se redujo de **~24 horas a menos de 5 segundos**.
* Las visualizaciones semanales aumentaron de **~500 a ~1.500**.
* En la primera semana de uso se concretaron **3 ventas** (con un ticket promedio de $50.000 CLP), equivalente a **~$150.000 CLP semanales** o **~$600.000 CLP mensuales proyectados**.
* Con una inversión inicial estimada de $1.710.000 CLP, el **payback proyectado es de 2,9 meses**.

---

## 3. Problema y Solución

### El Dolor del Negocio (Termopaneles El Monte)
* **Complejidad de Stock**: Disponer de un volumen alto de termopaneles fijos sin marco con más de 100 combinaciones diferentes de ancho y alto dificulta la visualización del stock.
* **Proceso Manual Ineficiente**: El 100% de las consultas e inventarios demandaban revisión física manual de los racks, retrasando las respuestas y perdiendo ventas. Alrededor del 30% de las consultas de Facebook Marketplace quedaban sin responder en menos de 24 horas.
* **Logística Crítica**: Al venderse productos frágiles y de gran peso, el negocio opera exclusivamente con **retiro en tienda física** (`Avenida los carrera 736 B, El monte`). Las solicitudes de despacho a domicilio generaban fricciones y cancelaciones frecuentes.

### El Dolor del Cliente Final (Particular/Hogar)
* **Falta de Claridad Técnica**: Los clientes no comprenden qué es un termopanel (vidrio doble aislante sin marco) o cómo medir el espacio de instalación (vano).
* **Asimetría de Información**: No saber si una medida específica está disponible obliga al cliente a contactar directamente al negocio, demorando el inicio de su proyecto de remodelación.

### Solución MVP Propuesta
* **Landing Page de Catálogo**: Un sitio responsivo clásico y de estética residencial que carga dinámicamente el inventario disponible y lo organiza en categorías claras (Chico, Mediano, Grande).
* **Asistente de Medidas e Integración**: Una calculadora de vano integrada que busca las 3 alternativas de stock más cercanas a las dimensiones ingresadas por el cliente.
* **Automatización en n8n**: Un webhook inteligente que lee la disponibilidad de Google Sheets en tiempo real, extrae medidas utilizando Inteligencia Artificial (Google Gemini) y registra cada lead en un Google Sheets de consultas, enviando la cotización redactada automáticamente vía correo electrónico.

---

## 4. Arquitectura y Flujo de Datos

### Diagrama de la Arquitectura (Mermaid)

```mermaid
graph TD
    User[Cliente Final] -->|1. Consulta Stock / Web| Web(Landing Page Frontend)
    Web -->|2. POST JSON / API| Webhook{n8n Webhook Node}
    Webhook -->|3. Leer Inventario| SheetsRead[Google Sheets: Leer Inventario]
    SheetsRead -->|4. Filas de Stock| CodeNode[Code Node: Reglas y Cotizador]
    CodeNode -->|5. Procesar Prompt| Gemini[Gemini Node: Message a model]
    Gemini -->|6. Respuesta Redactada| FormatResponse[Format Response Node]
    FormatResponse -->|7a. Responder Web| Responder[Respond to Webhook Node]
    FormatResponse -->|7b. Registrar Lead| SheetsWrite[Google Sheets: Registrar Consulta]
    FormatResponse -->|7c. Enviar Email| EmailNode[Enviar Email de Cotización]
    Responder -->|8. API Response| Web
    Web -->|9. Muestra Resultados y Alerta de Cotización| User
    SheetsRead -.-->|Origen de Datos| DBStock[(Spreadsheet: Inventario)]
    SheetsWrite -.-->|leads base| DBLeads[(Spreadsheet: Consultas)]
```

---

## 5. Las 4 Verticales

| Vertical | Capa cumplida | Dónde está la evidencia |
| :--- | :--- | :--- |
| **Automatización** | Capa 1 | [n8n-workflow-termopaneles.json](src/flujo/n8n-workflow-termopaneles.json) |
| **IA** | Capa 1 | Prompt del sistema en el nodo *Message a model* del workflow de n8n |
| **BBDD** | Capa 1 | [Google Sheets de Inventario](https://docs.google.com/spreadsheets/d/e/2PACX-1vSeHty4SN7j5L3ypMmiOSSlGYGOnd_qkU8LTwRO1aC55yZXMzPxdIQJ4MRQ6auYdhxpoMuS1R9nj_Ft/pub?output=csv) |
| **Front** | Capa 1 | [Página Web Termopaneles El Monte](https://termopaneles-el-monte.vercel.app/) |

---

## 6. Cómo Interactúa el Usuario con la Solución

### Perfil: Cliente Particular (Hogar)
1. **Búsqueda e Inspección**: Navega en la landing page y visualiza las categorías del inventario disponible en tiempo real.
2. **Uso de Calculadora de Vano**: Ingresa las medidas del espacio que desea cubrir (ej. ancho 80 cm, alto 120 cm).
3. **Recepción de Alternativas**: La calculadora le muestra las 3 alternativas más similares disponibles en el stock físico, detallando la diferencia exacta en centímetros.
4. **Cotización e Ingreso de Email**: Hace clic en el botón "Cotizar", ingresa manualmente su dirección de correo electrónico y recibe de inmediato la cotización redactada automáticamente por Gemini.

### Perfil: Administrador del Negocio
1. **Actualización de Stock**: Cuando se fabrica o vende un termopanel, el administrador simplemente actualiza las columnas de la fila correspondiente en la hoja `"Inventario"` de su Google Sheets.
2. **Recepción de Leads**: Abre la hoja `"Consultas"` de Google Sheets para revisar las dimensiones solicitadas, teléfonos, nombres e historial de cotizaciones automatizadas y realizar seguimiento.

---

## 7. Automatización, Inventario y Prompts
* **Fuente de Inventario**: Google Sheets que sirve como base de datos en la nube.
* **Lógica del Algoritmo JS**: 
  * Exclusión de registros con unidades igual o menor a `0`.
  * Filtro de filas con estado `"agotado"`, `"vendido"` o `"no disponible"`.
  * Tolerancia máxima de ±5 cm por discrepancias en medidas.
  * Cálculo de alternativas similares por menor distancia Euclidiana.
* **Prompt de IA (Gemini)**: Diseñado para actuar como el asistente virtual de ventas de "Termopaneles El Monte", con tono residencial, clásico, claro y servicial, recalcando las políticas (solo retiro, sin marcos, sin despachos).

---

## 8. Cómo Correrlo

### Requisitos Previos
* Servidor local o hosting estático (ej. Vercel).
* Cuenta de n8n activa.
* Credenciales de Google Sheets, SMTP y Google Gemini (PaLM) API.

### Instrucciones
1. **Clonar Repositorio**:
   ```bash
   git clone https://github.com/javieracarrizo2-ship-it/termopaneles-el-monte.git
   ```
2. **Levantar Servidor Local**: Al tratarse de una web estática pura, abre el proyecto levantando un servidor web local con `npx http-server` en la raíz de la carpeta del proyecto para evitar bloqueos de CORS.
3. **Configurar n8n**:
   * Importa el flujo desde [n8n-workflow-termopaneles.json](src/flujo/n8n-workflow-termopaneles.json).
   * Vincula tus credenciales de Google Sheets, SMTP y Google Gemini API.
   * Cambia los ID de planilla a tus respectivas hojas de cálculo de Drive y activa el flujo.

---

## 9. Sección Track-Específica (Track A)
* **Cliente**: Termopaneles El Monte (El Monte, Talagante, Chile).
* **Contacto**: Javiera Carrizo, socia fundadora — javieracarrizo2@gmail.com
* **Métricas antes/después**:
  * Tiempo de respuesta inicial: ~24 horas → <5 segundos.
  * Visualizaciones semanales: ~500 → ~1.500.
  * Ventas concretadas la primera semana: 3 ventas (ticket promedio $50.000 CLP).
  * Valor cuantificado: ~$150.000 CLP semanales / ~$600.000 CLP mensuales proyectados. Payback estimado de 2,9 meses.

---

## 10. Limitaciones y Próximos Pasos

### Limitaciones Actuales
* **Validación Humana Final**: El stock final y la reserva física del vidrio requieren confirmación humana por correo o chat para coordinar el día exacto de retiro.
* **Dependencia de Google Sheets**: No escala óptimamente ante volúmenes masivos de transacciones concurrentes.
* **Solo Retiro**: La imposibilidad de ofrecer despacho a domicilio restringe las ventas a nivel geográfico local.

### Siguientes Pasos
1. **Agregar el número de los clientes al Google Sheets**: Guardar de forma automatizada todos los teléfonos que ingresen para poder realizar llamadas de seguimiento de leads de forma directa.
2. **Método de Pago Integrado**: Agregar pasarelas de pago de reserva (como Webpay) si el negocio escala.
3. **Optimización de Tolerancia**: Ajustar la tolerancia Euclidiana para dar mayor peso al ancho que al alto del panel según requerimientos estructurales de instalación.

---

## 11. Roles del Equipo

| Integrante | Rol Principal | Contribución Clave |
| :--- | :--- | :--- |
| **Javiera Carrizo** | Directora de Desarrollo / Tech Lead | Desarrollo de frontend estático, integración del planificador SVG dinámico, parser CSV, integración de webhook n8n y optimización responsiva del layout. |
| **Sara Díaz** | Directora de KPIs | Gestión de métricas comerciales, análisis de payback, visualizaciones semanales y ticket de venta promedio. |
| **Horacio Sánchez** | Arquitecto de n8n / Backend | Diseño del flujo de trabajo de n8n, conexión del webhook, lógica en JavaScript para procesamiento de stock y enrutado de datos. |
| **Raimundo Pérez** | Director de Documentación | Redacción de informes técnicos, análisis del problema de negocio y diseño de la arquitectura del MVP. |
| **Martín Horta** | UI/UX Designer / Frontend | Diseño de la interfaz, estilos responsivos en CSS, selección tipográfica y paleta de colores residenciales. |
