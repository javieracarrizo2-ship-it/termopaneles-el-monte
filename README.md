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
# Termopaneles El Monte

## 1. Identificación

- **Nombre del grupo:** Termopaneles El Monte
- **Integrantes:** Javiera Carrizo, Sara Díaz, Horacio Sánchez, Raimundo Pérez, Martín Horta.
- **Profesor:** Benjamín Happey
- **Track elegido:** Track A
- **Tipo declarado:** MVP
- **Sitio desplegado:** https://termopaneleselmonte-termo-s-projects.vercel.app/
- **Repositorio:** https://github.com/javieracarrizo2-ship-it/termopaneles-el-monte

## 2. Resumen ejecutivo

Construimos una página web de apoyo en ventas para Termopaneles El Monte que organiza el stock disponible de termopaneles por medida, y ayuda a convertir las visitas provenientes de Facebook Marketplace en consultas más claras. La solución permite filtrar termopaneles por medida, visualizar sus proporciones mediante una vista previa, estimar qué medidas podrían servir como referencia mediante el planificador de cobertura, y orientarse con la calculadora de vano. El tiempo de respuesta bajó de ~24 horas a ~5 minutos y las visualizaciones semanales aumentaron de ~500 a ~1.500. En la primera semana de uso se concretaron 3 ventas (ticket promedio $50.000), equivalente a ~$150.000 semanales o ~$600.000 CLP mensuales proyectados. Con una inversión inicial de $1.710.000, el payback estimado es de 2,9 meses.

## 3. Problema y solución
**El dolor:** Termopaneles El Monte vende unidades de remate con medidas fijas y variables entre sí, no termopaneles a medida. Esto dificulta la gestión de stock (muchos SKUs distintos, imposible estandarizar precios) y complica al cliente identificar qué medida necesita. En los últimos 30 días la empresa recibió 70 consultas por Facebook Marketplace; ~30% (≈21 consultas mensuales) no se respondían en menos de 24 horas, representando una oportunidad de venta afectada de ~$1.050.000 CLP mensuales.

**La solución:** Una plataforma web estática que centraliza el inventario directamente en el navegador del cliente leyendo el catálogo publicado como CSV desde Google Sheets. Incluye visualización de proporciones, calculadora de vano y planificador de cobertura. Al cotizar, genera un enlace de WhatsApp directo con el detalle exacto de su solicitud para que el cliente lo envíe con un solo clic. Javiera valida disponibilidad real, precio final y coordina el retiro.

## 4. Arquitectura

            CLIENTE                        GOOGLE SHEETS (BBDD)
    +-----------------------+           +-----------------------+
    | Catálogo Web (HTML/JS)| <-------> | Google Sheets (CSV)   | (Lectura de stock en vivo)
    +-----------------------+           +-----------------------+
                |
                v (Genera enlace de WhatsApp con cotización resumida)
    +-----------------------+
    | WhatsApp (Javiera)    |
    | - Validación manual   |
    | - Coordinación retiro |
    +-----------------------+

## 5. Las 4 verticales

Vertical       | Capa cumplida | Dónde está la evidencia
BBDD           | Capa 1        | Link a Google Sheets: (https://docs.google.com/spreadsheets/d/1XiVBqJeEwqdkMm3JSrA33OnbGS9N9mfvRjPg-U006no/edit?gid=324384237#gid=324384237) o /src/bbdd/URL-Sheets
Front          | Capa 1        | Link web: https://termopaneleselmonte-termo-s-projects.vercel.app/ o src/ui/URL-Página-web

## 6. Touchpoint del usuario

El usuario final (cliente) gatilla la solución desde la web, al cotizar una medida y cantidad de termopanel en el catálogo o carrito. Esto genera un mensaje compacto de WhatsApp que abre el chat listo para enviar a la vendedora.

## 7. Cómo correrlo

- Requisitos: Un servidor web estático local (como Live Server o VS Code extension) o hosting (Vercel).
- Configuración: Configurar `googleSheetUrl` en `app.js` con el enlace CSV publicado de Google Sheets.
- Probar: Cotizar una medida desde la web y verificar que se abra el chat de WhatsApp con el mensaje resumido.erificar que llegue el mensaje por WhatsApp y se registre el lead.

## 8. Sección track-específica (Track A)

- **Cliente:** Termopaneles El Monte (El Monte, Talagante)
- **Contacto:** Javiera Carrizo, socia fundadora — javieracarrizo2@gmail.com
- **Métricas antes/después:**
  - Tiempo de respuesta: ~24 horas → <5 minutos
  - Visualizaciones semanales: ~500 → ~1.500
  - Ventas primera semana: 3 (ticket promedio $50.000)
- **Cuantificación:** ~$150.000 CLP semanales / ~$600.000 CLP mensuales proyectados; inversión inicial $1.710.000; payback estimado 2,9 meses

## 9. Limitaciones y próximos pasos

- Tolerancia fija de ±5cm: no se ajusta según el tipo de vano, puede sugerir medidas que no calzan bien en casos límite.
- Dependencia de Google Sheets como BBDD: no escala si el inventario crece o si hay ediciones concurrentes.
- Validación manual final: Javiera debe confirmar disponibilidad y precio a mano, no hay reserva automática de stock (riesgo de vender lo mismo dos veces).
- Sin autenticación/control de acceso: cualquiera con el link de la web puede cotizar, sin trazabilidad de usuarios.
- No hay manejo de errores visible: si el webhook falla o el agente no encuentra stock, no está claro qué mensaje recibe el cliente.
- Un solo canal de entrega: solo WhatsApp; no cubre Facebook Marketplace directamente pese a que ahí se origina buena parte del tráfico.
- Dependencia de un solo agente humano (Javiera) como cuello de botella para cerrar ventas.

**Proximos pasos**
- Agregar el numero de los clientes al Google Sheets, por si se pierde el chat saber quien consulto/ cerro trato.
- Si el negocio escala migrar a una base de datos real, para evitar problemas
- Si el negocio escala, integrar metodo de pago y eventual conveio con empresa de transporte para enviar los paneles.
- Ajustar tolerancia, dado que el panel podria ser <5 cm qu ele vano, sin embargo no podría ser >5 cm, el cliente tedría que agrandar el vano, sería un adificultad extra.

## 10. Roles del equipo

Javiera Carrizo: Conseguir la empresa.
Horacio Sanchez: Flujo N8N
Sara Díaz: KPIs
Raimundo Perez: Desarrollar el informe.
Martín Horta: Construir/Diseñar la página web.
