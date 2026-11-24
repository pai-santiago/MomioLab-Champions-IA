"""Entrenamiento y predicción de Random Forest."""

from __future__ import annotations

import random

from .common import CLASS_COUNT, FEATURES, RESULT_CLASSES, _normalize


def _class_counts(rows: list[dict]) -> list[int]:
    return [sum(row["target"] == result for row in rows) for result in RESULT_CLASSES]

def _gini(counts: list[int]) -> float:
    total = sum(counts) or 1
    return 1 - sum((count / total) ** 2 for count in counts)

def _best_split(rows: list[dict], feature_indexes: list[int], min_leaf: int):
    """Busca cortes que reduzcan Gini; esta rutina construye las piezas internas del bosque."""
    parent_counts = _class_counts(rows)
    parent_gini = _gini(parent_counts)
    best = None
    for feature in feature_indexes:
        ordered = sorted(rows, key=lambda row: row["features"][feature])
        left_counts = [0] * CLASS_COUNT
        right_counts = parent_counts.copy()
        for index in range(len(ordered) - 1):
            result_index = RESULT_CLASSES.index(ordered[index]["target"])
            left_counts[result_index] += 1
            right_counts[result_index] -= 1
            left_size = index + 1
            right_size = len(ordered) - left_size
            if left_size < min_leaf or right_size < min_leaf:
                continue
            current = ordered[index]["features"][feature]
            following = ordered[index + 1]["features"][feature]
            if current == following:
                continue
            weighted_gini = (left_size / len(ordered)) * _gini(left_counts) + (right_size / len(ordered)) * _gini(right_counts)
            gain = parent_gini - weighted_gini
            if best is None or gain > best["gain"]:
                best = {"feature": feature, "threshold": (current + following) / 2, "gain": gain}
    return best

def _build_forest_tree(rows: list[dict], rng: random.Random, importance: list[float], depth: int = 0) -> dict:
    """Arma un árbol limitado que forma parte del Random Forest, no un modelo aparte."""
    counts = _class_counts(rows)
    if depth >= 5 or len(rows) < 32 or sum(count > 0 for count in counts) <= 1:
        return {"leaf": True, "counts": counts}

    feature_indexes = rng.sample(range(len(FEATURES)), 4)
    split = _best_split(rows, feature_indexes, min_leaf=16)
    if split is None or split["gain"] <= 1e-8:
        return {"leaf": True, "counts": counts}

    feature = split["feature"]
    threshold = split["threshold"]
    left_rows = [row for row in rows if row["features"][feature] <= threshold]
    right_rows = [row for row in rows if row["features"][feature] > threshold]
    if not left_rows or not right_rows:
        return {"leaf": True, "counts": counts}
    importance[feature] += split["gain"] * len(rows)
    return {
        "leaf": False,
        "feature": feature,
        "threshold": threshold,
        "left": _build_forest_tree(left_rows, rng, importance, depth + 1),
        "right": _build_forest_tree(right_rows, rng, importance, depth + 1),
    }

def fit_random_forest(rows: list[dict], tree_count: int = 17, seed: int = 501) -> dict:
    """Entrena 17 árboles con muestras bootstrap y subconjuntos aleatorios de variables."""
    if not rows:
        raise ValueError("No hay ejemplos para entrenar Random Forest.")
    rng = random.Random(seed)
    sample_size = min(1100, len(rows))
    trees = []
    combined_importance = [0.0] * len(FEATURES)
    for _ in range(tree_count):
        # Bootstrap: cada árbol ve una muestra aleatoria con reemplazo del historial.
        sample = [rng.choice(rows) for _ in range(sample_size)]
        tree_importance = [0.0] * len(FEATURES)
        trees.append(_build_forest_tree(sample, rng, tree_importance))
        for feature, value in enumerate(tree_importance):
            combined_importance[feature] += value
    return {
        "type": "randomForest",
        "name": "Random Forest",
        "trees": trees,
        "tree_count": tree_count,
        "sample_size": sample_size,
        "importance": _normalize(combined_importance),
    }

def _leaf_probabilities(counts: list[int]) -> list[float]:
    """Suaviza los conteos de cada hoja para que ninguna clase tenga probabilidad cero."""
    return _normalize([count + 1 for count in counts])

def _predict_forest_tree(tree: dict, features: list[float]) -> list[float]:
    node = tree
    while not node["leaf"]:
        if features[node["feature"]] <= node["threshold"]:
            node = node["left"]
        else:
            node = node["right"]
    return _leaf_probabilities(node["counts"])

def predict_random_forest(model: dict, features: list[float]) -> list[float]:
    """Promedia las probabilidades de los árboles para producir una sola estimación."""
    predictions = [_predict_forest_tree(tree, features) for tree in model["trees"]]
    return [sum(prediction[index] for prediction in predictions) / len(predictions) for index in range(CLASS_COUNT)]
