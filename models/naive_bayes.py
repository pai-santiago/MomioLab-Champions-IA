"""Entrenamiento, predicción y explicación de Naive Bayes Gaussiano."""

from __future__ import annotations

import math

from .common import CLASS_COUNT, FEATURES, RESULT_CLASSES, _normalize


def _softmax(log_values: list[float]) -> list[float]:
    """Convierte puntajes logarítmicos a probabilidades estables que suman 1."""
    peak = max(log_values)
    return _normalize([math.exp(value - peak) for value in log_values])


def fit_naive_bayes(rows: list[dict]) -> dict:
    """Entrena Naive Bayes Gaussiano: medias y varianzas por resultado y variable."""
    priors = []
    means = []
    variances = []
    for result in RESULT_CLASSES:
        class_rows = [row for row in rows if row["target"] == result]
        count = max(len(class_rows), 1)
        # Suavizado de Laplace para que una clase rara no obtenga probabilidad previa cero.
        priors.append((len(class_rows) + 1) / (len(rows) + CLASS_COUNT))
        class_means = [
            sum(row["features"][feature] for row in class_rows) / count
            for feature in range(len(FEATURES))
        ]
        class_variances = []
        for feature, mean in enumerate(class_means):
            variance = sum((row["features"][feature] - mean) ** 2 for row in class_rows) / count
            class_variances.append(max(variance, 0.04))
        means.append(class_means)
        variances.append(class_variances)

    model = {"type": "naiveBayes", "name": "Naive Bayes", "priors": priors,
             "means": means, "variances": variances}
    model["importance"] = _naive_bayes_importance(model)
    return model

def _gaussian_log_density(value: float, mean: float, variance: float) -> float:
    return -0.5 * math.log(2 * math.pi * variance) - ((value - mean) ** 2) / (2 * variance)

def predict_naive_bayes(model: dict, features: list[float]) -> list[float]:
    """Calcula P(resultado | variables) con logaritmos para evitar números diminutos."""
    log_scores = []
    for class_index in range(CLASS_COUNT):
        score = math.log(max(model["priors"][class_index], 1e-12))
        for feature, value in enumerate(features):
            score += _gaussian_log_density(
                value, model["means"][class_index][feature], model["variances"][class_index][feature]
            )
        log_scores.append(score)
    return _softmax(log_scores)

def _naive_bayes_importance(model: dict) -> list[float]:
    """Ordena variables por la separación de sus distribuciones entre resultados."""
    raw = []
    for feature in range(len(FEATURES)):
        largest_gap = 0.0
        for first in range(CLASS_COUNT):
            for second in range(first + 1, CLASS_COUNT):
                scale = math.sqrt((model["variances"][first][feature] + model["variances"][second][feature]) / 2)
                gap = abs(model["means"][first][feature] - model["means"][second][feature]) / max(scale, 0.05)
                largest_gap = max(largest_gap, gap)
        raw.append(largest_gap)
    return _normalize(raw)

def explain_naive_bayes(model: dict, features: list[float], predicted_index: int) -> list[dict]:
    """Devuelve las cuatro variables que más distinguen la clase elegida de las alternativas."""
    impacts = []
    for feature, name in enumerate(FEATURES):
        target = _gaussian_log_density(
            features[feature], model["means"][predicted_index][feature], model["variances"][predicted_index][feature]
        )
        alternatives = [
            _gaussian_log_density(features[feature], model["means"][other][feature], model["variances"][other][feature])
            for other in range(CLASS_COUNT) if other != predicted_index
        ]
        impacts.append({"name": name, "impact": target - sum(alternatives) / len(alternatives)})
    return sorted(impacts, key=lambda item: abs(item["impact"]), reverse=True)[:4]
