# SisGranja v3: estado de implementación

## Criterios de aceptación

- Dado un estado local existente, al iniciar sin conexión se recupera la copia más reciente entre IndexedDB y localStorage antes de habilitar los controles. Copias diferentes con la misma marca temporal detienen el arranque para evitar una sustitución silenciosa.
- Dadas dos granjas con miembros distintos, cada usuario autenticado solo puede leer su propia granja y su estado. Una escritura con versión obsoleta debe fallar sin cambiar los datos.
- Dado un peso bajo y una lectura de temperatura inferior a 16 °C de menos de 24 horas, se muestra una advertencia de revisión que no atribuye causalidad al frío ni modifica la ración automáticamente.
- Dada un área y dosis de siembra indicadas por el productor, se calcula la cantidad de semilla de cada componente usando la conversión de metros cuadrados a hectáreas.
- Dada una madre identificada y sus antecedentes confirmados, al registrar su cuarto parto aparece en descarte y no se acepta otro parto con ese código.

## Límites y pendientes para producción

- La migración SQL v3 es aditiva y se prueba localmente; no está aplicada ni conectada a la aplicación. La sincronización existente aún usa la fila compartida `granja-principal`, sin aislamiento multiempresa. Se necesita autenticación, selección y vinculación de granja, migración consentida de datos y resolución de conflictos antes de activarla.
- IndexedDB conserva una copia del estado, pero la aplicación también depende de localStorage y tiene restricciones de cuota y concurrencia entre pestañas. Se requieren pruebas de interrupciones y dispositivos reales; no se garantiza disponibilidad absoluta.
- Los nuevos partos requieren un código único de madre y, para el primer registro, el número de partos previos confirmados. Los históricos sin identidad no se asignan automáticamente: se requiere conciliación manual y verificación de códigos. La exactitud depende de los antecedentes suministrados y de no reutilizar códigos.
- La cámara, el reconocimiento de voz y el análisis remoto dependen de capacidades del navegador, permisos y, en el caso de la IA remota, conectividad y configuración del proveedor. Una imagen no confirma una enfermedad.
- Las pautas sanitarias y nutricionales existentes requieren revisión veterinaria y contraste con fuentes oficiales vigentes antes de usarlas o atribuirlas a INIA, UNALM o publicaciones de Lilia Chauca. No existe aquí una formulación nutricional validada por etapa y localidad.
- Las pruebas automatizadas no sustituyen pruebas en navegadores, migración real de datos, recuperación de respaldo, auditoría de seguridad ni validación del despliegue Vercel.

## Pruebas

Con Node.js 22 compatible con `--experimental-strip-types`, ejecutar `npm ci` y `npm test` desde la raíz del proyecto. Las pruebas SQL usan PostgreSQL embebido y no afectan a Supabase.