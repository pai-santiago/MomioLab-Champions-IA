"""Punto de entrada del paquete: datos compartidos y dos algoritmos."""

from .common import (
    FEATURES,
    RESULT_CLASSES,
    build_examples,
    evaluate,
    load_matches,
    predict,
    temporal_split_index,
    upcoming_features,
)
from .naive_bayes import explain_naive_bayes, fit_naive_bayes, predict_naive_bayes
from .random_forest import fit_random_forest, predict_random_forest

__all__ = [
    "FEATURES",
    "RESULT_CLASSES",
    "build_examples",
    "evaluate",
    "explain_naive_bayes",
    "fit_naive_bayes",
    "fit_random_forest",
    "load_matches",
    "predict",
    "predict_naive_bayes",
    "predict_random_forest",
    "temporal_split_index",
    "upcoming_features",
]
