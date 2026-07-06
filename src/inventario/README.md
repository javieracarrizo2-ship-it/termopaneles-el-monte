# Estructura y Origen del Inventario

El inventario de termopaneles fijos (vidrio doble aislante) se gestiona de forma centralizada en Google Sheets. Esta sección detalla la estructura y el mapeo de columnas que utiliza la landing page y el sistema de automatización para consultar el stock disponible en tiempo real.

## Fuente de Datos (Esquema de Columnas)
La hoja `"Inventario"` de Google Sheets (con datos cargados a partir de [inventario-maestro-limpio.csv](file:///c:/Users/Javiera%20Carrizo/OneDrive/Documentos/Demo%20agentic/inventario-maestro-limpio.csv)) debe contener exactamente las siguientes columnas:

| Columna | Tipo | Descripción | Ejemplo |
| :--- | :--- | :--- | :--- |
| `id` | Texto | Identificador único del producto (interno) | `TPA054` |
| `tipo` | Texto | Tipo de termopanel (siempre `Fijo`) | `Fijo` |
| `ancho_cm` | Decimal | Ancho físico del termopanel en centímetros | `21` |
| `alto_cm` | Decimal | Alto físico del termopanel en centímetros | `100` |
| `ancho_m` | Decimal | Ancho físico convertido a metros | `0.21` |
| `alto_m` | Decimal | Alto físico convertido a metros | `1.0` |
| `unidades` | Entero | Unidades disponibles en stock real | `1` |
| `estado` | Texto | Disponibilidad comercial del producto | `Bajo stock` o `Disponible` |
| `medida_cm` | Texto | Formato legible de ancho x alto en cm | `21 x 100 cm` |
| `medida_m` | Texto | Formato legible de ancho x alto en metros | `0,21 x 1,0 m` |
| `descripcion`| Texto | Descripción del termopanel | `Termopanel fijo 21 x 100 cm` |
| `rack` | Texto | Ubicación física en la bodega del negocio | `Rack 1` |

---

## Reglas de Clasificación de Tamaños
Para simplificar la navegación de clientes particulares, las medidas se clasifican automáticamente en tres categorías según su área:

* **Chico**: Área menor a `0.5 m²` (ventanas pequeñas de ventilación o baños).
  $$\text{Área} = \text{ancho\_m} \times \text{alto\_m} < 0.5$$
* **Mediano**: Área entre `0.5 m²` y `1.2 m²` inclusive (ventanas estándar de dormitorios/cocinas).
  $$0.5 \le \text{Área} \le 1.2$$
* **Grande**: Área mayor a `1.2 m²` (grandes ventanales, terrazas o quinchos).
  $$\text{Área} > 1.2$$

---

## Políticas Críticas del Inventario
1. **Exclusión de Stock Cero**: Los productos con `unidades <= 0` o con estados como `"agotado"`, `"vendido"` o `"no disponible"` se filtran automáticamente y no se muestran ni se cotizan.
2. **Exclusividad de Retiro**: Toda la información de stock está sujeta a **retiro coordinado** en la tienda física de El Monte (`Avenida los carrera 736 B, El monte`).
