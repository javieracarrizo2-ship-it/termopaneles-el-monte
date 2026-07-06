# Reglas de Negocio e Inventario

Este documento detalla las directrices comerciales, operativas y logísticas que rigen el MVP de **Termopaneles El Monte**.

---

## 1. Especificaciones del Producto Principal
Los productos comercializados son únicamente **termopaneles fijos** (vidrio doble aislante) listos para entrega inmediata.
* **Composición Técnica**:
  * Cristal 1: 4 mm
  * Cristal 2: 4 mm
  * Separador de aire: bronce 11.5 mm
* **Importante**: Se venden **sin marco** (solo el vidrio doble hermético). Este detalle técnico debe estar siempre claro para evitar que el cliente particular asuma que incluye carpintería de PVC o aluminio.

---

## 2. Políticas Logísticas y de Venta
El negocio opera bajo restricciones estrictas debido al peso, volumen y fragilidad del producto:

1. **Solo Retiro**: La venta es exclusivamente con retiro en tienda.
2. **Sin Despacho**: Bajo ninguna circunstancia se realizan despachos o envíos a domicilio por parte del negocio.
3. **Dirección Física de Retiro**: `Avenida los carrera 736 B, El monte`.
4. **Coordinación previa**: Antes del retiro, el cliente debe coordinar vía WhatsApp la disponibilidad final y el horario para evitar viajes innecesarios.

---

## 3. Lógica de Precios y Cotización
* **Precio Unitario Estándar**: Se establece un valor unitario de cotización estimada de **$25.000** por termopanel fijo (variable editable en la automatización).
* **Fórmula de Cotización**:
  $$\text{Total Estimado} = \text{Cantidad Solicitada} \times \$25.000$$
* **Restricción de Cotización**: Solo se muestra cotización en la respuesta si existe stock real suficiente para cubrir la cantidad solicitada. Si hay stock disponible pero no alcanza, se informa cuántas unidades hay y el valor unitario para que el cliente decida.
