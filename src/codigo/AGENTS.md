# Guía del Proyecto: Landing Page de Termopaneles Fijos

Este documento establece las bases, lineamientos de diseño, reglas de negocio y criterios técnicos que cualquier agente de IA o desarrollador debe respetar al trabajar en este proyecto.

---

## 1. Visión y Objetivos del Proyecto

La landing page tiene como objetivo principal exhibir el stock disponible de termopaneles fijos e incentivar a clientes particulares a cotizar a través de WhatsApp.

*   **Producto Principal**: Termopaneles fijos (vidrio doble aislante) listos para entrega inmediata según inventario.
    *   **Especificaciones Técnicas**:
        *   **Cristal 1**: 4 mm
        *   **Cristal 2**: 4 mm
        *   **Separador**: bronce 11.5 mm
        *   **Estructura**: Vienen **sin marco** (solo el termopanel/vidrio doble aislante).
*   **Casos de Uso del Cliente**: Cerramiento de espacios, remodelaciones, construcción de quinchos, terrazas, oficinas, bodegas o proyectos habitacionales.
*   **Acción Clave (Conversión)**: Cotización por WhatsApp de medidas específicas.

---

## 2. Público Objetivo y Tono

*   **Público**: Clientes particulares (propietarios de viviendas, personas realizando proyectos hágalo-usted-mismo o remodelaciones en su hogar).
*   **Tono de Comunicación**: 
    *   Cercano, residencial, clásico y sumamente claro.
    *   Explicativo y libre de tecnicismos complejos de vidriería o ingeniería que puedan confundir al cliente.
    *   Transparente en cuanto a las condiciones de stock y logística.

---

## 3. Políticas de Venta y Logística (Crítico)

Toda la landing page debe dejar en claro e inequívocamente visible las siguientes condiciones operativas, especialmente cerca de las secciones de inventario y botones de cotización:

1.  **Solo Retiro**: La venta es exclusivamente con retiro en tienda física.
2.  **Dirección de Retiro**: `Avenida los carrera 736 B, El monte`.
3.  **Sin Despachos**: Bajo ninguna circunstancia se realizan despachos o envíos a domicilio.

---

## 4. Estilo Visual y Diseño (UI/UX)

Para lograr un diseño premium que cause una excelente impresión en el usuario, se deben seguir las siguientes directrices estéticas:

*   **Estilo**: Moderno, residencial y clásico. Debe sentirse limpio, acogedor y confiable.
*   **Paleta de Colores**: 
    *   Evitar colores puros primarios (como rojo o azul puro de navegador).
    *   Usar una paleta armoniosa: tonos acristalados (azules/celestes grisáceos suaves), tonos neutros (grises cálidos, blanco roto) y detalles que transmitan hogar (por ejemplo, verde oliva suave o madera/arena en elementos destacados).
*   **Tipografía**: Utilizar fuentes modernas de Google Fonts (por ejemplo, *Inter*, *Outfit* o *Roboto*).
*   **Interactividad**: Implementar efectos hover interactivos en tarjetas de productos, micro-animaciones en los botones de llamada a la acción (CTA) y transiciones suaves para el filtrado.
*   **Imágenes**: Utilizar imágenes de alta calidad (sin placeholders genéricos) que representen terrazas, quinchos o ventanas modernas instaladas en hogares reales.

---

## 5. Origen de Datos e Inventario

La fuente de verdad del inventario es el archivo [`inventario-termopaneles-landing.csv`](file:///c:/Users/Javiera%20Carrizo/OneDrive/Documentos/Demo%20agentic/inventario-termopaneles-landing.csv).

### Estructura del CSV:
*   `id`: Identificador del producto (ej: TPA001). *Nota: No se muestra al cliente en la cotización de WhatsApp.*
*   `tipo`: Tipo de termopanel (siempre "Fijo").
*   `ancho_cm` y `alto_cm`: Medidas en centímetros.
*   `unidades`: Cantidad en stock.
*   `estado`: Estado del inventario ("Disponible" o "Bajo stock").
*   `medida_cm`: Formato de texto "Ancho x Alto cm".
*   `rack`: Ubicación de almacenamiento (ej: "Rack 1"). *Uso interno.*

### Reglas de Negocio para el Inventario:
1.  **Exclusión de Stock Cero**: No se deben mostrar productos que tengan 0 unidades en stock.
2.  **Estados de Disponibilidad**: 
    *   Resaltar visualmente si un producto tiene "Bajo stock" para generar urgencia de compra.

---

## 6. Categorización y Filtros por Tamaño

Dado que las medidas son muy específicas y pueden abrumar al cliente residencial, el inventario debe clasificarse en categorías de tamaño sencillas de entender:

*   **Chico**: Área del termopanel menor a **0.5 m²** (ej: ventanas de baño, ventilaciones chicas).
    $$\text{Área} = \text{ancho\_m} \times \text{alto\_m} < 0.5$$
*   **Mediano**: Área del termopanel entre **0.5 m² y 1.2 m²** inclusive (ej: ventanas estándar de dormitorios o cocinas).
    $$0.5 \le \text{Área} \le 1.2$$
*   **Grande**: Área del termopanel mayor a **1.2 m²** (ej: ventanales de terrazas, quinchos, separadores de oficina).
    $$\text{Área} > 1.2$$

### Interfaz de Filtros:
La landing debe incluir botones o pestañas para que el usuario filtre rápidamente entre estas tres categorías (**Chico**, **Mediano**, **Grande**), además de permitir ordenar por ancho o alto si es necesario.

---

## 7. Flujo de Cotización por WhatsApp

Al hacer clic en el botón **"Cotizar por WhatsApp"** de cualquier termopanel, se debe abrir un enlace de WhatsApp prellenado para el número de la empresa.

### Requisitos del Mensaje:
1.  **NO** incluir el `id` del producto (ej: no usar `TPA001` para no complicar al cliente residencial).
2.  El mensaje debe venir prellenado **exactamente** con esta estructura (respetando los saltos de línea):

```text
Hola, quiero cotizar un termopanel fijo de medida [ancho_cm] x [alto_cm] cm.

Necesito cotizar ___ unidad(es).

Quedo atento/a al precio y disponibilidad actual. Gracias.
```

*Nota: Reemplazar `[ancho_cm]` y `[alto_cm]` con los valores reales del termopanel seleccionado.*

---

## 8. Criterios de Desarrollo y Código

Cualquier cambio o desarrollo en la landing page debe ceñirse a las siguientes directrices técnicas:

1.  **Tecnología**: HTML5 semántico, Vanilla CSS (para estilos estilizados y personalizados) y JavaScript puro (JS). Evitar frameworks o librerías pesadas a menos que se solicite explícitamente.
2.  **Lectura del CSV**: El JS debe consumir de forma dinámica el archivo `inventario-termopaneles-landing.csv` (o mediante un proceso de parseo integrado) para asegurar que el inventario se actualice fácilmente al reemplazar el archivo.
3.  **SEO**: Mantener un único `<h1>`, estructura jerárquica de encabezados, metaetiquetas descriptivas y etiquetas ALT en todas las imágenes.
4.  **Diseño Responsivo**: Garantizar que la tabla o cuadrícula de termopaneles se vea excelente en smartphones, tablets y pantallas de escritorio.
