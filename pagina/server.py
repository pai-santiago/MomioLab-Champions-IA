"""Servidor local: página estática más API Python para los dos modelos."""

from __future__ import annotations

import json
import mimetypes
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

PROJECT_DIR = Path(__file__).resolve().parents[1]
PAGE_DIR = PROJECT_DIR / "pagina"
sys.dont_write_bytecode = True
sys.path.insert(0, str(PROJECT_DIR))

from models import (  # noqa: E402 - primero se agrega la raíz local al import path
    FEATURES,
    RESULT_CLASSES,
    build_examples,
    evaluate,
    explain_naive_bayes,
    fit_naive_bayes,
    fit_random_forest,
    load_matches,
    predict,
    temporal_split_index,
    upcoming_features,
)


STATIC_FILES = {
    "/": PAGE_DIR / "index.html",
    "/index.html": PAGE_DIR / "index.html",
    "/styles.css": PAGE_DIR / "styles.css",
    "/app.js": PAGE_DIR / "app.js",
    "/server.py": PAGE_DIR / "server.py",
    "/cli.py": PAGE_DIR / "cli.py",
    "/models/__init__.py": PROJECT_DIR / "models" / "__init__.py",
    "/models/common.py": PROJECT_DIR / "models" / "common.py",
    "/models/naive_bayes.py": PROJECT_DIR / "models" / "naive_bayes.py",
    "/models/random_forest.py": PROJECT_DIR / "models" / "random_forest.py",
    "/champions_matches.csv": PROJECT_DIR / "champions_matches.csv",
    "/explicacion_codigo.html": PAGE_DIR / "explicacion_codigo.html",
    "/README.md": PAGE_DIR / "README.md",
    "/FUENTES.md": PAGE_DIR / "FUENTES.md",
    "/referencias/LICENSE-legacy-source.txt": PAGE_DIR / "referencias" / "LICENSE-legacy-source.txt",
    "/MomioLab_Champions_IA.pptx": PAGE_DIR / "presentacion" / "MomioLab_Champions_IA.pptx",
}


def prepare_project_state() -> dict:
    """Carga el CSV una vez, evalúa por fecha y deja los modelos listos para consultas."""
    matches = load_matches(PROJECT_DIR / "champions_matches.csv")
    if not matches:
        raise RuntimeError("El CSV no contiene partidos válidos de Champions League.")

    examples = build_examples(matches)
    if len(examples) < 20:
        raise RuntimeError("No hay suficientes partidos con historial previo para entrenar los modelos.")

    split_index = temporal_split_index(examples)
    train_rows = examples[:split_index]
    test_rows = examples[split_index:]
    if not test_rows:
        raise RuntimeError("No hay suficientes ejemplos para hacer la evaluación cronológica.")

    factories = {
        "naiveBayes": fit_naive_bayes,
        "randomForest": fit_random_forest,
    }
    metrics = []
    models = {}
    for key, factory in factories.items():
        evaluation_model = factory(train_rows)
        metrics.append({"name": evaluation_model["name"], **evaluate(evaluation_model, test_rows)})
        # Para predicciones interactivas se vuelve a entrenar usando todo el historial disponible.
        models[key] = factory(examples)

    validation_note = (
        f"Entrenamiento: {len(train_rows):,} partidos hasta {train_rows[-1]['date']}. "
        f"Evaluación: {len(test_rows):,} partidos posteriores, del {test_rows[0]['date']} "
        f"al {test_rows[-1]['date']}. La separación es cronológica para simular el uso de datos pasados."
    )
    return {
        "matches": matches,
        "examples": examples,
        "models": models,
        "metrics": metrics,
        "validationNote": validation_note,
    }


def json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


class MomioLabHandler(BaseHTTPRequestHandler):
    """Sirve los archivos permitidos y expone el análisis por una API local."""

    state: dict

    def do_GET(self) -> None:
        pathname = urlparse(self.path).path
        if pathname == "/api/dashboard":
            self.send_json({
                "matches": self.state["matches"],
                "featureNames": FEATURES,
                "resultClasses": RESULT_CLASSES,
                "metrics": self.state["metrics"],
                "validationNote": self.state["validationNote"],
            })
            return

        file_path = STATIC_FILES.get(pathname)
        if file_path is None:
            self.send_error(404, "Archivo no encontrado")
            return
        self.send_file(file_path)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/predict":
            self.send_error(404, "Ruta API no encontrada")
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            request = json.loads(self.rfile.read(size).decode("utf-8"))
            home_name = str(request.get("home", ""))
            away_name = str(request.get("away", ""))
            model_key = str(request.get("model", "naiveBayes"))
            if model_key not in self.state["models"]:
                raise ValueError("Elige Naive Bayes o Random Forest.")
            if not home_name or not away_name or home_name == away_name:
                raise ValueError("Elige dos equipos distintos.")

            features = upcoming_features(self.state["matches"], home_name, away_name)
            model = self.state["models"][model_key]
            probabilities = predict(model, features)
            predicted_index = probabilities.index(max(probabilities))
            importance = [
                {"name": name, "value": value}
                for name, value in zip(FEATURES, model["importance"])
            ]
            explanation = explain_naive_bayes(model, features, predicted_index) if model_key == "naiveBayes" else []
            self.send_json({
                "model": model["name"],
                "modelKey": model_key,
                "probabilities": probabilities,
                "predicted": RESULT_CLASSES[predicted_index],
                "importance": importance,
                "explanation": explanation,
                "treeCount": model.get("tree_count"),
            })
        except (ValueError, KeyError, json.JSONDecodeError) as error:
            self.send_json({"error": str(error)}, status=400)
        except Exception as error:  # responde con claridad si hay una fila inesperada o un problema del modelo
            self.send_json({"error": f"No se pudo calcular la predicción: {error}"}, status=500)

    def send_json(self, value: object, status: int = 200) -> None:
        body = json_bytes(value)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_file(self, file_path: Path) -> None:
        try:
            body = file_path.read_bytes()
        except OSError:
            self.send_error(404, "Archivo no encontrado")
            return
        content_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        if file_path.suffix in {".html", ".css", ".js", ".py", ".md", ".txt"}:
            content_type += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        print("[MomioLab] " + (format % args))


def main() -> None:
    state = prepare_project_state()
    MomioLabHandler.state = state
    port = int(os.environ.get("PORT", "4180"))
    server = ThreadingHTTPServer(("127.0.0.1", port), MomioLabHandler)
    print("MomioLab Champions listo en http://127.0.0.1:" + str(port))
    print(f"Datos: {len(state['matches']):,} partidos de Champions | modelos: Naive Bayes y Random Forest")
    print("Para detenerlo, vuelve a esta terminal y presiona Ctrl+C.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor detenido.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
