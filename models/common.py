"""Funciones compartidas: datos, variables, clases y evaluación temporal."""

from __future__ import annotations

import csv
import math
from collections import defaultdict
from pathlib import Path


RESULT_CLASSES = ["Local", "Empate", "Visitante"]

FEATURES = [
    "Puntos recientes del local (5 partidos)",
    "Puntos recientes del visitante (5 partidos)",
    "Goles a favor del local (5 partidos)",
    "Goles en contra del local (5 partidos)",
    "Goles a favor del visitante (5 partidos)",
    "Goles en contra del visitante (5 partidos)",
    "Diferencia de goles reciente del local",
    "Diferencia de goles reciente del visitante",
    "Victorias recientes del local (5 partidos)",
    "Victorias recientes del visitante (5 partidos)",
    "Puntos en enfrentamientos directos (local - visitante)",
    "Goles en enfrentamientos directos (local - visitante)",
]

COMPETITION_LABEL = "UEFA Champions League / Copa de Europa"

CLASS_COUNT = len(RESULT_CLASSES)

def load_matches(csv_path: Path) -> list[dict]:
    """Lee y filtra el CSV para conservar únicamente resultados válidos de Champions."""
    matches = []
    with csv_path.open("r", encoding="utf-8-sig", newline="") as source:
        for row in csv.DictReader(source):
            try:
                home_goals = int(row["home_goals"])
                away_goals = int(row["away_goals"])
            except (KeyError, TypeError, ValueError):
                continue
            if (
                row.get("competition") != COMPETITION_LABEL
                or not row.get("home_team")
                or not row.get("away_team")
                or not row.get("date")
            ):
                continue
            matches.append({
                **row,
                "home_goals": home_goals,
                "away_goals": away_goals,
            })
    return sorted(matches, key=lambda match: match["date"])

def _result_index(home_goals: int, away_goals: int) -> int:
    """Mapea el marcador a Local, Empate o Visitante."""
    if home_goals > away_goals:
        return 0
    if home_goals == away_goals:
        return 1
    return 2

def _summarize_team(history: list[dict]) -> dict[str, float]:
    """Resume puntos, goles y victorias en los cinco partidos anteriores."""
    recent = history[-5:]
    count = max(len(recent), 1)
    return {
        "points": sum(game["points"] for game in recent) / count,
        "goals_for": sum(game["gf"] for game in recent) / count,
        "goals_against": sum(game["ga"] for game in recent) / count,
        "goal_difference": sum(game["gf"] - game["ga"] for game in recent) / count,
        "wins": sum(game["points"] == 3 for game in recent) / count,
    }

def _make_features(home_history: list[dict], away_history: list[dict], meetings: list[dict], home_name: str) -> list[float]:
    """Convierte forma y enfrentamientos previos a las doce variables del modelo."""
    home = _summarize_team(home_history)
    away = _summarize_team(away_history)
    recent_meetings = meetings[-5:]
    home_points = away_points = home_goals = away_goals = 0

    for match in recent_meetings:
        # En cada duelo directo, cambia la perspectiva si el equipo elegido jugó de visitante.
        chosen_team_was_historical_home = match["home_team"] == home_name
        chosen_goals = match["home_goals"] if chosen_team_was_historical_home else match["away_goals"]
        other_goals = match["away_goals"] if chosen_team_was_historical_home else match["home_goals"]
        home_goals += chosen_goals
        away_goals += other_goals
        outcome = _result_index(chosen_goals, other_goals)
        if outcome == 0:
            home_points += 3
        elif outcome == 1:
            home_points += 1
            away_points += 1
        else:
            away_points += 3

    meeting_count = max(len(recent_meetings), 1)
    return [
        home["points"], away["points"],
        home["goals_for"], home["goals_against"],
        away["goals_for"], away["goals_against"],
        home["goal_difference"], away["goal_difference"],
        home["wins"], away["wins"],
        (home_points - away_points) / meeting_count,
        (home_goals - away_goals) / meeting_count,
    ]

def build_examples(matches: list[dict]) -> list[dict]:
    """Crea ejemplos en orden temporal sin filtrar el resultado del mismo día al historial."""
    ordered = sorted(matches, key=lambda match: match["date"])
    team_history: dict[str, list[dict]] = defaultdict(list)
    pair_history: dict[tuple[str, str], list[dict]] = defaultdict(list)
    examples = []
    start = 0

    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and ordered[end]["date"] == ordered[start]["date"]:
            end += 1
        day = ordered[start:end]
        additions = []

        for match in day:
            home_name = match["home_team"]
            away_name = match["away_team"]
            pair_key = tuple(sorted((home_name, away_name), key=str.casefold))
            home_history = team_history[home_name]
            away_history = team_history[away_name]
            if len(home_history) >= 3 and len(away_history) >= 3:
                examples.append({
                    "date": match["date"],
                    "season": match.get("season", ""),
                    "home": home_name,
                    "away": away_name,
                    "features": _make_features(home_history, away_history, pair_history[pair_key], home_name),
                    "target": RESULT_CLASSES[_result_index(match["home_goals"], match["away_goals"])],
                })

            outcome = _result_index(match["home_goals"], match["away_goals"])
            home_points = 3 if outcome == 0 else 1 if outcome == 1 else 0
            away_points = 3 if outcome == 2 else 1 if outcome == 1 else 0
            additions.append((match, pair_key, home_points, away_points))

        # Los partidos de esta fecha entran al historial solo después de formar todos sus ejemplos.
        for match, pair_key, home_points, away_points in additions:
            team_history[match["home_team"]].append({
                "gf": match["home_goals"], "ga": match["away_goals"], "points": home_points,
            })
            team_history[match["away_team"]].append({
                "gf": match["away_goals"], "ga": match["home_goals"], "points": away_points,
            })
            pair_history[pair_key].append(match)
        start = end

    return examples

def upcoming_features(matches: list[dict], home_name: str, away_name: str) -> list[float]:
    """Calcula variables con el último historial conocido de los dos equipos."""
    team_history: dict[str, list[dict]] = defaultdict(list)
    direct_meetings = []

    for match in sorted(matches, key=lambda item: item["date"]):
        outcome = _result_index(match["home_goals"], match["away_goals"])
        team_history[match["home_team"]].append({
            "gf": match["home_goals"], "ga": match["away_goals"],
            "points": 3 if outcome == 0 else 1 if outcome == 1 else 0,
        })
        team_history[match["away_team"]].append({
            "gf": match["away_goals"], "ga": match["home_goals"],
            "points": 3 if outcome == 2 else 1 if outcome == 1 else 0,
        })
        clubs = {match["home_team"], match["away_team"]}
        if home_name in clubs and away_name in clubs:
            direct_meetings.append(match)

    missing_teams = [name for name in (home_name, away_name) if name not in team_history]
    if missing_teams:
        raise ValueError("Equipo no encontrado en el CSV de Champions: " + ", ".join(missing_teams))
    if len(team_history[home_name]) < 3 or len(team_history[away_name]) < 3:
        raise ValueError("Cada equipo necesita al menos tres partidos anteriores en el historial.")
    return _make_features(team_history[home_name], team_history[away_name], direct_meetings, home_name)

def _normalize(values: list[float]) -> list[float]:
    total = sum(values) or 1.0
    return [value / total for value in values]

def predict(model: dict, features: list[float]) -> list[float]:
    """Dirige la predicción al módulo del algoritmo seleccionado."""
    if model["type"] == "naiveBayes":
        from .naive_bayes import predict_naive_bayes
        return predict_naive_bayes(model, features)
    from .random_forest import predict_random_forest
    return predict_random_forest(model, features)


def evaluate(model: dict, examples: list[dict]) -> dict:
    """Calcula Accuracy, Log loss y Brier en el bloque cronológico de evaluación."""
    correct = 0
    log_loss = 0.0
    brier = 0.0
    for example in examples:
        probabilities = predict(model, example["features"])
        actual = RESULT_CLASSES.index(example["target"])
        if probabilities.index(max(probabilities)) == actual:
            correct += 1
        log_loss -= math.log(max(probabilities[actual], 1e-12))
        for result_index, probability in enumerate(probabilities):
            expected = 1.0 if result_index == actual else 0.0
            brier += (probability - expected) ** 2
    count = max(len(examples), 1)
    return {"accuracy": correct / count, "logLoss": log_loss / count, "brier": brier / count, "sample": len(examples)}

def temporal_split_index(rows: list[dict]) -> int:
    """Separa el 80% inicial y mantiene juntas las filas de una misma fecha."""
    cut = max(1, int(len(rows) * 0.8))
    boundary_date = rows[cut]["date"] if cut < len(rows) else None
    while cut > 1 and boundary_date and rows[cut - 1]["date"] == boundary_date:
        cut -= 1
    return cut
