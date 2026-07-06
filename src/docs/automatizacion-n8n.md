# Automatización con n8n

El flujo de automatización se encuentra en el archivo [n8n-workflow-termopaneles.json](file:///c:/Users/Javiera%20Carrizo/OneDrive/Documentos/Demo%20agentic/src/flujo/n8n-workflow-termopaneles.json). Este documento describe la lógica de implementación técnica de los nodos clave.

---

## 1. Webhook de Entrada (`Webhook de Entrada`)
* **URL de Producción**: `https://<TU-DOMINIO-N8N>/webhook/termopaneles/consultar-stock`
* **URL de Test**: `https://<TU-DOMINIO-N8N>/webhook-test/termopaneles/consultar-stock`
* **CORS**: Habilitado para responder llamadas de frontend desde:
  * `https://termopaneles-el-monte.vercel.app`
  * `http://localhost:3000` (desarrollo local)
  * `http://localhost:5173` (desarrollo local Vite)

---

## 2. Motor de Filtrado y Búsqueda (`Filtrar y Cotizar Stock`)
El nodo Code ejecuta un script de JavaScript que procesa las filas leídas de Google Sheets. A continuación se detallan sus reglas operativas:

### Tolerancia en Dimensiones
Para evitar que diferencias mínimas de redondeo decimal (como `21 cm` vs `21.0 cm` o `21.4 cm`) impidan la venta, el script aplica una **tolerancia de ±0.5 cm**:
```javascript
const exactMatches = cleanInventory.filter(row => {
    const rowAncho = parseFloat(row.ancho_cm);
    const rowAlto = parseFloat(row.alto_cm);
    return Math.abs(rowAncho - ancho) <= 0.5 && Math.abs(rowAlto - alto) <= 0.5;
});
```

### Búsqueda de Alternativas Más Cercanas
Si no se encuentra un producto exacto en stock, el flujo calcula la **distancia Euclidiana** entre la medida solicitada y todas las medidas disponibles en inventario:
$$\text{Distancia} = \sqrt{(\text{ancho\_cm} - \text{ancho\_solicitado})^2 + (\text{alto\_cm} - \text{alto\_solicitado})^2}$$
El script ordena los resultados de menor a mayor distancia y devuelve las **3 mejores alternativas** etiquetadas con la advertencia: `(medida similar, no exacta)`.

---

## 3. Manejo de Errores y Excepciones
* **Fallo en Google Sheets**: Si el nodo de lectura de Google Sheets falla o expira, el Code node intercepta el error en un bloque `try-catch`, registrando el log en la variable `error_log` y devolviendo una respuesta amigable al cliente: 
  *"No pudimos revisar el inventario en este momento. Escríbenos por WhatsApp para confirmar disponibilidad."*
* **Fallo en OpenAI**: Si la IA falla al interpretar un mensaje pero la solicitud contiene los campos numéricos directos `ancho_cm` y `alto_cm`, el sistema procede a realizar la consulta omitiendo la IA.
* **Transparencia técnica**: Bajo ningún concepto se retornan trazas de error técnicas o de base de datos (`400`, `500` raw) al navegador del cliente final.
