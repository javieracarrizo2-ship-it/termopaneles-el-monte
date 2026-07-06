# Prompts Utilizados en el Sistema

Este directorio contiene los prompts reales del modelo de Lenguaje de Inteligencia Artificial (OpenAI GPT-4o-mini) utilizados en la automatización del flujo de n8n.

## Archivos de Prompt

* **[prompt-extraccion-medidas.txt](file:///c:/Users/Javiera%20Carrizo/OneDrive/Documentos/Demo%20agentic/src/prompts/prompt-extraccion-medidas.txt)**: Contiene las reglas del sistema para interpretar los mensajes informales de los usuarios (en español) y convertirlos a formato JSON estructurado.

## Lógica y Esquema de Salida
El prompt instruye a la IA para comportarse de forma puramente determinista y extraer las siguientes propiedades:
1. `ancho_cm`: El ancho extraído de la consulta, estandarizado a centímetros (ej. "1.2 metros" a `120`).
2. `alto_cm`: El alto extraído de la consulta, estandarizado a centímetros.
3. `cantidad`: La cantidad solicitada (por defecto `1` si no se especifica).
4. `requiere_medida`: Booleano que indica si la consulta requiere especificar dimensiones o si ya están provistas.

Este diseño permite aislar al frontend y al motor de búsqueda de expresiones informales, garantizando que el filtrado de inventario reciba datos con formato numérico correcto.
