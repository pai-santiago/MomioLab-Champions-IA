# MomioLab · Champions IA

Prototipo académico para analizar únicamente la UEFA Champions League y la Copa de Europa. La página compara dos algoritmos escritos en Python: **Naive Bayes Gaussiano** y **Random Forest**.

## Los tres elementos principales

- `pagina/`: página web, servidor y demostración de terminal, además de esta guía y la presentación.
- `champions_matches.csv`: resultados históricos de Champions ya consolidados.
- `models/`: código Python separado para variables compartidas, Naive Bayes y Random Forest.

La interfaz visual (`app.js`) sigue en JavaScript porque corre en el navegador. Los cálculos de inteligencia artificial se hacen en Python dentro de los módulos de `models/`.

## Abrir y correr en Visual Studio Code

1. Abre la carpeta `MomioLab_Champions_IA` en VS Code.
2. Abre **Terminal → Nueva terminal**. La terminal debe quedar en la raíz del proyecto.
3. Inicia el servidor:

```bash
python pagina/server.py
```

4. Abre `http://127.0.0.1:4180`.

Se requiere Python 3.10 o posterior. El prototipo usa solo la biblioteca estándar; no requiere `pip install`. Para detener el servidor, presiona `Ctrl+C` en esa terminal.

## Demostrar el algoritmo desde la terminal

En otra terminal, desde la raíz del proyecto, escribe:

```bash
python pagina/cli.py "Real Madrid CF" "FC Bayern München" naiveBayes
python pagina/cli.py "Real Madrid CF" "FC Bayern München" randomForest
```

El programa enseña los partidos procesados, el modelo seleccionado, las probabilidades Local/Empate/Visitante y las variables con mayor importancia. Los nombres de los clubes deben coincidir con los que aparecen en el CSV.

## Qué ocurre en `models/`

1. `common.py` carga el CSV, crea la etiqueta Local/Empate/Visitante y calcula las 12 variables temporales compartidas.
2. `naive_bayes.py` contiene `fit_naive_bayes` y `predict_naive_bayes`.
3. `random_forest.py` contiene `fit_random_forest` y `predict_random_forest`; el bosque construye 17 árboles internos con muestras bootstrap y selecciones aleatorias de variables.
4. `common.py` también evalúa Accuracy, Log loss y Brier en el bloque de partidos posterior al entrenamiento.

El **árbol de decisión independiente se quitó del selector y del proyecto**. Random Forest necesita árboles internamente; por eso permanecen como componentes de ese conjunto, pero el usuario solo elige entre Naive Bayes y Random Forest.

`__init__.py` expone las funciones del paquete para que `server.py` y `cli.py` puedan importar los dos algoritmos desde `models`.

## Cómo se forma la evaluación

Los ejemplos se ordenan por fecha. El 80% más antiguo entrena los modelos y el bloque posterior se usa para calcular métricas. Los partidos de una misma fecha se mantienen juntos. Después, para una predicción interactiva, ambos modelos se vuelven a entrenar con todo el historial disponible.

- **Accuracy:** proporción de resultados acertados si se toma la clase con mayor probabilidad.
- **Log loss:** penaliza más una probabilidad baja asignada al resultado que sí ocurrió.
- **Brier:** mide el error de las tres probabilidades en conjunto.

## Variables y límites

Se usan puntos, goles a favor y en contra, diferencia de goles y victorias recientes de cada equipo, además de diferencias de puntos y goles en duelos directos. La base no incluye alineaciones, lesiones, disponibilidad de jugadores ni cuotas de mercado. Las probabilidades y los momios decimales (`1 / probabilidad`) son estimaciones académicas y no garantizan marcadores.

Para explicar la interfaz, abre `explicacion_codigo.html`. Para la exposición, el PowerPoint está en `presentacion/MomioLab_Champions_IA.pptx`. La cobertura y las fuentes de los datos están en `FUENTES.md`.
