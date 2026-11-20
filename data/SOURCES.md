# Fuentes, cobertura y licencias

El archivo procesado [`champions_matches.csv`](champions_matches.csv) contiene partidos normalizados y una columna `competition` fija: `UEFA Champions League / Copa de Europa`. Las dos fuentes son específicas de esta competición y su antecesora histórica; el proyecto no combina partidos de ligas nacionales, Europa League, Conference League ni otras copas.

## Fuente histórica: 1955–56 a 2021–22

- Proyecto: [CharlieGnomo/champions_uefa_data](https://github.com/CharlieGnomo/champions_uefa_data), que describe su conjunto como datos extraídos de UEFA Champions League para las temporadas 1955–56 a 2021–22.
- Archivo original: [matches.csv](https://raw.githubusercontent.com/CharlieGnomo/champions_uefa_data/master/matches.csv)
- Licencia declarada por el repositorio: Apache License 2.0. Se adjunta una copia en `data/source/LICENSE-legacy-source.txt`.
- Cobertura usada: partidos de temporadas hasta 2021–22 inclusive.

## Fuente reciente: 2022–23 a 2025–26

- Conjunto documentado de temporadas: [UEFA Champions League, 2011–12 a 2025–26 (OpenFootball)](https://itemresponsewarehouse.org/tables/openfootball_uefacl_2011_2026/)
- Proyecto de datos: [openfootball/champions-league](https://github.com/openfootball/champions-league)
- Archivo consultado: [tabla CSV compilada](https://redivis.com/api/v1/tables/datapages.irw_competitions%3Av7_1.openfootball_uefacl_2011_2026/rows?format=csv)
- Licencia del proyecto OpenFootball: CC0 1.0. Se seleccionaron solo temporadas desde 2022–23 para evitar duplicar las temporadas de la fuente histórica.
- La descripción del conjunto reciente indica que cubre fase de grupos/liguilla en adelante; no se asume cobertura completa de fases clasificatorias.

## Transformación

`scripts/prepare-data.mjs` transforma las columnas de ambas fuentes a un esquema común, etiqueta cada registro con `UEFA Champions League / Copa de Europa`, usa el marcador final registrado en cada origen, elimina el solapamiento de temporadas y ordena por fecha. La aplicación y la demostración de terminal filtran por esa etiqueta antes de analizar. Los CSV originales se conservan en `data/source/` para repetir el proceso.

## Uso académico

Las fuentes y licencias se indican aquí para atribución y revisión. La aplicación es un ejercicio escolar de análisis estadístico y no una herramienta para garantizar resultados deportivos o recomendar apuestas.
