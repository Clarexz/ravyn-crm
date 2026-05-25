# **Instrucciones de Desarrollo para el Agente de IA**

Este documento define las reglas de interacción y generación de código que el agente de IA debe seguir para colaborar en el desarrollo de este proyecto.

## **Principios Fundamentales**

1. **Contexto del Proyecto:** Antes de proponer cualquier cambio, revisa siempre los documentos clave del proyecto, como README.md, planes de implementación (IMPLEMENTATION\_PLAN.md) y el código existente. El contexto es esencial para generar contribuciones relevantes.  
2. **Desarrollo Incremental:** La metodología de trabajo es estrictamente incremental. No intentes implementar funcionalidades completas o modificar múltiples archivos en una sola interacción. El objetivo es avanzar con pasos pequeños, funcionales y verificables.  
3. **Claridad y Precisión:** Las explicaciones deben ser claras y concisas. El código generado debe seguir las convenciones de estilo del proyecto y estar bien documentado donde sea necesario.

## **Flujo de Trabajo para Nuevas Funcionalidades**

1. **Análisis de la Tarea:** Cuando se te asigne una tarea o una fase de un plan (ej. "Encárgate de la Fase 1 del plan de implementación"), tu primera acción es analizarla y proponer un **plan de acción detallado** para esa tarea específica.  
   * Desglosa la tarea en pasos lógicos y manejables.  
   * Identifica los archivos que necesitarán ser creados o modificados.  
   * Finaliza tu propuesta preguntando explícitamente si debe iniciar la implementación.  
2. **Generación de Código Modular:**  
   * Una vez confirmado el plan de acción, procede con la implementación **archivo por archivo** o, si es un cambio pequeño, **función por función**.  
   * **Nunca modifiques un archivo completo de golpe.** Propón los cambios en bloques lógicos y auto-contenidos. Por ejemplo: "Primero, añadiremos la nueva enumeración al archivo .h", esperas confirmación, y luego "Ahora, implementaremos la función xyz en el archivo .cpp".  
3. **Proceso de Validación Iterativo:**  
   * Después de entregar un bloque de código (sea una nueva función, una modificación o un archivo completo), **detén la generación**.  
   * Espera la confirmación del usuario de que el código ha sido integrado y que el proyecto compila sin errores.  
   * Solo después de esta validación, procede con el siguiente paso de tu plan de acción.

## **Reglas de Estilo y Contenido**

1. **Respuestas Concisas:** Evita generar bloques de código excesivamente largos en una sola respuesta. Es preferible dividir una función grande en varias partes si es necesario. El objetivo es minimizar la probabilidad de errores y facilitar la revisión.  
2. **Cero Emojis en Archivos Técnicos:** No se deben usar emojis en el código fuente, comentarios de código, ni en documentos técnicos como este o los planes de implementación.  
3. **Lenguaje:** Mantén la comunicación y la documentación en español, de acuerdo al idioma principal del proyecto. Los comentarios en el código pueden estar en inglés si así lo dicta la convención del proyecto.

## **Objetivo de Estas Reglas**

* **Reducir Errores:** Asegurar que cada paso es validado minimiza la introducción de regresiones.  
* **Mantener un Desarrollo Ordenado:** Seguir un plan claro y progresivo facilita el seguimiento y la colaboración.  
* **Optimizar la Interacción:** Evitar respuestas largas y fallidas que requieran múltiples correcciones.  
* **Garantizar la Funcionalidad:** Cada bloque de código entregado debe ser, en la medida de lo posible, funcional y fácil de verificar.