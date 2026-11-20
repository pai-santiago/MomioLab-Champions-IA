# MomioLab · Champions IA

Prototipo académico independiente para analizar exclusivamente resultados históricos de la UEFA Champions League y su antecesora directa, la Copa de Europa. No incluye ligas nacionales, Europa League, Conference League ni otras competiciones. La idea es mostrar, de forma entendible, qué pasó en los partidos, qué variables pesan en cada modelo y cómo se estima un resultado para dos clubes.

## Abrir en Visual Studio Code

1. Abre esta carpeta completa en VS Code: `MomioLab_Champions_IA`.
2. Abre una terminal integrada con **Terminal → Nueva terminal**.
3. Confirma que Node.js esté instalado con `node --version`.
4. Ejecuta `npm start` y abre `http://127.0.0.1:4180` en el navegador.

No requiere `npm install`: usa Node.js y tecnologías web nativas. Para detener el servidor, presiona `Ctrl+C` en la terminal.

También puedes lanzar **MomioLab: abrir el dashboard** desde **Terminal → Ejecutar tarea**.

## Presentación del proyecto

La exposición editable de 10 diapositivas está en [`presentacion/MomioLab_Champions_IA.pptx`](presentacion/MomioLab_Champions_IA.pptx). Explica el alcance exclusivo de Champions, las fuentes, las variables, los tres algoritmos, la evaluación temporal y una demostración. Incluye notas para exponer y referencias en las diapositivas correspondientes.

La guía detallada del código está en [`explicacion_codigo.html`](explicacion_codigo.html). Puedes abrirla directamente o entrar desde el enlace del pie de página de la aplicación. Recorre archivos, preparación de datos, variables, algoritmos, métricas y comandos de VS Code.

Al abrir la app aparece el **modo sencillo de exposición**: resumen, selección de equipos y explicación. Pulsa **Mostrar todo el proyecto** si quieres presentar también el historial, las métricas y los siguientes pasos. Los tres modelos siguen disponibles en el selector.

## Explicar el algoritmo desde la terminal

En VS Code puedes correr la tarea **MomioLab: demostrar Naive Bayes en terminal**. Para cambiar los equipos o el algoritmo escribe:

```bash
npm run demo -- "Real Madrid CF" "FC Bayern München" naiveBayes
npm run demo -- "Real Madrid CF" "FC Bayern München" decisionTree
npm run demo -- "Real Madrid CF" "FC Bayern München" randomForest
```

El programa imprime los pasos principales, las probabilidades de local/empate/visitante y las variables más importantes. Los nombres tienen que coincidir con los que aparecen en el CSV. Si un club cambió de nombre o no aparece, el dashboard permite revisar la lista completa.

## Qué hace el prototipo

- Consolida 7,994 marcadores, todos identificados en la columna `competition` como `UEFA Champions League / Copa de Europa`, en `data/champions_matches.csv`.
- Calcula la forma de cada equipo usando sus cinco partidos previos y los enfrentamientos directos previos.
- Compara la predicción de tres algoritmos requeridos: **Naive Bayes**, **árbol de decisión** y **Random Forest**.
- Mide Accuracy, Log loss y Brier con una partición cronológica: los partidos más antiguos entrenan; el 20% más reciente sirve de evaluación. No divide partidos de la misma fecha entre ambos grupos.
- Permite elegir dos clubes y ver probabilidades 1X2, forma reciente, enfrentamientos directos y una explicación del modelo.
- Estima “momio decimal justo” como `1 / probabilidad`. Es una conversión matemática sin margen de casa de apuestas; no es consejo ni garantía de apuesta.

## Cómo presentar los tres algoritmos

- **Naive Bayes:** estima la probabilidad de cada resultado a partir de distribuciones históricas por clase. Para este ejemplo se usa la versión gaussiana y se supone independencia entre variables.
- **Árbol de decisión:** hace preguntas sobre variables como puntos recientes y separa los partidos en ramas hasta asignar probabilidades de resultado.
- **Random Forest:** entrena varios árboles con muestras aleatorias y promedia sus votos para obtener una estimación más estable.

Las tres versiones están implementadas con JavaScript nativo en `models.js`. No son cajas negras de librería: las funciones principales tienen comentarios en español para explicarlas en clase. El preprocesamiento está en `scripts/prepare-data.mjs`; la web se conecta desde `app.js`; el ejemplo de terminal está en `cli.mjs`.

## Variables incluidas

Las características usan solo partidos anteriores al partido evaluado: puntos, goles a favor y en contra, diferencia de goles, victorias recientes y balance de puntos/goles en enfrentamientos directos. El prototipo no incluye nombres ni disponibilidad de jugadores, alineaciones, lesiones, cuotas de mercado ni competición local. Esto se puede integrar después cuando exista un conjunto de datos consistente para esos factores.

## Límites que conviene mencionar en la exposición

- El archivo llega hasta la temporada 2025–26; la temporada 2026–27 en curso no está incluida.
- La fuente histórica antigua contiene las temporadas hasta 2021–22; la fuente reciente empieza en 2022–23 y se documenta como fase de grupos/liguilla en adelante. Las rondas clasificatorias de esas temporadas recientes pueden no estar cubiertas.
- El formato local/visitante puede no representar bien todas las rondas de ida y vuelta ni los partidos en sede neutral.
- La importancia describe asociaciones que aprendió el modelo, no demuestra que una variable cause el resultado.
- Una temporada, forma o plantilla cambia. Un pronóstico histórico no conoce el estado actual de jugadores ni equipos.

Para procedencia y licencias, consulta [`data/SOURCES.md`](data/SOURCES.md).
