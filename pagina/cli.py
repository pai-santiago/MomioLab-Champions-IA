"""Demostración del entrenamiento y la predicción desde la terminal de VS Code."""

from __future__ import annotations

import sys
from pathlib import Path

PROJECT_DIR = Path(__file__).resolve().parents[1]
sys.dont_write_bytecode = True
sys.path.insert(0, str(PROJECT_DIR))

from models import (  # noqa: E402 - la raíz del proyecto se agrega antes de importar
    FEATURES,
    RESULT_CLASSES,
    build_examples,
    explain_naive_bayes,
    fit_naive_bayes,
    fit_random_forest,
    load_matches,
    predict,
    upcoming_features,
)


ALGORITHMS = {
    "naiveBayes": fit_naive_bayes,
    "randomForest": fit_random_forest,
}


def main() -> int:
    if len(sys.argv) < 3:
        print('Uso: python pagina/cli.py "Real Madrid CF" "FC Bayern München" [naiveBayes|randomForest]')
        return 1

    home_name, away_name = sys.argv[1:3]
    algorithm = sys.argv[3] if len(sys.argv) > 3 else "naiveBayes"
    if home_name.casefold() == away_name.casefold():
        print("Elige dos equipos distintos.")
        return 1
    if algorithm not in ALGORITHMS:
        print("Algoritmo válido: naiveBayes o randomForest.")
        return 1

    try:
        matches = load_matches(PROJECT_DIR / "champions_matches.csv")
    except OSError as error:
        print(f"No se pudo abrir el archivo de partidos: {error}")
        return 1
    if not matches:
        print("El CSV no contiene resultados válidos de Champions League.")
        return 1
    examples = build_examples(matches)
    if len(examples) < 20:
        print("No hay suficientes partidos históricos para entrenar el modelo.")
        return 1
    model = ALGORITHMS[algorithm](examples)
    try:
        features = upcoming_features(matches, home_name, away_name)
    except ValueError as error:
        print("No se pudo analizar ese partido: " + str(error))
        return 1
    probabilities = predict(model, features)
    predicted_index = probabilities.index(max(probabilities))

    print("\nMOMIOLAB · ANÁLISIS DE CHAMPIONS LEAGUE")
    print(f"Partidos históricos: {len(matches):,} | ejemplos con historial previo: {len(examples):,}")
    print("Algoritmo: " + model["name"])
    print("Idea: usar forma reciente y duelos anteriores para estimar Local / Empate / Visitante.")
    print(f"\nPartido de ejemplo: {home_name} vs {away_name}")
    for result, probability in zip(RESULT_CLASSES, probabilities):
        print(f"  {result:<10}{probability * 100:5.1f}%")
    print("Resultado con mayor probabilidad: " + RESULT_CLASSES[predicted_index])

    print("\nVariables más importantes (estimación del modelo):")
    ranked = sorted(zip(FEATURES, model["importance"]), key=lambda item: item[1], reverse=True)
    for name, value in ranked[:5]:
        print(f"  {value * 100:5.1f}%  {name}")

    if algorithm == "naiveBayes":
        print("\nNaive Bayes combina la probabilidad previa de cada resultado con la densidad de sus variables.")
        print("Señales que más distinguen el resultado sugerido:")
        for item in explain_naive_bayes(model, features, predicted_index):
            direction = "+" if item["impact"] >= 0 else "-"
            print(f"  {direction} {item['name']}")
    else:
        print(f"\nRandom Forest promedia las probabilidades de {model['tree_count']} árboles internos.")
        print("Cada árbol ve una muestra bootstrap y considera variables aleatorias en sus cortes.")

    print("\nAviso: son estimaciones académicas basadas en resultados pasados, no una garantía de marcador.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
