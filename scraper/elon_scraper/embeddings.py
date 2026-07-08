import hashlib
import math
import os
import struct
from datetime import datetime
from decimal import Decimal
from typing import Any, Iterable

import pymysql


DEFAULT_MODEL = "BAAI/bge-small-en-v1.5"
DEFAULT_CACHE_DIR = "/home/elon/.cache/fastembed"
DEFAULT_BATCH_SIZE = 64

ALLERGEN_COLUMNS = (
    ("egg", "allergy_egg"),
    ("shellfish", "allergy_shellfish"),
    ("soy", "allergy_soy"),
    ("peanut", "allergy_peanut"),
    ("wheat", "allergy_wheat"),
    ("tree nut", "allergy_tree_nut"),
    ("milk", "allergy_milk"),
    ("sesame", "allergy_sesame"),
    ("fish", "allergy_fish"),
)

_models: dict[tuple[str, str | None], Any] = {}


def embeddings_enabled(default: bool = True) -> bool:
    return env_bool("FASTEMBED_ENABLED", default)


def model_name_from_env() -> str:
    return os.environ.get("FASTEMBED_MODEL", DEFAULT_MODEL).strip() or DEFAULT_MODEL


def cache_dir_from_env() -> str | None:
    value = os.environ.get("FASTEMBED_CACHE_PATH", DEFAULT_CACHE_DIR).strip()
    return value or None


def batch_size_from_env() -> int:
    value = os.environ.get("FASTEMBED_BATCH_SIZE", str(DEFAULT_BATCH_SIZE))
    try:
        return max(1, min(512, int(value)))
    except ValueError:
        return DEFAULT_BATCH_SIZE


def refresh_embeddings_for_service_date(
    service_date: str,
    config: Any,
    model_name: str | None = None,
    cache_dir: str | None = None,
) -> dict[str, Any]:
    target_date = str(service_date)
    active_model = model_name or model_name_from_env()
    active_cache_dir = cache_dir if cache_dir is not None else cache_dir_from_env()

    connection = connect(config)
    try:
        with connection.cursor() as cursor:
            if not embeddings_table_exists(cursor):
                return {
                    "status": "skipped",
                    "reason": "food_search_embeddings table is missing",
                    "service_date": target_date,
                    "model": active_model,
                    "embedded": 0,
                }

            rows = load_embedding_rows(cursor, target_date)
            if not rows:
                return {
                    "status": "ok",
                    "service_date": target_date,
                    "model": active_model,
                    "dimension": 0,
                    "candidates": 0,
                    "embedded": 0,
                    "up_to_date": 0,
                }

            existing_hashes = load_existing_hashes(cursor, target_date, active_model)
            candidates = []
            for row in rows:
                text = build_food_embedding_text(row)
                text_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
                key = embedding_key(row)
                if existing_hashes.get(key) == text_hash:
                    continue
                candidates.append({"row": row, "text": text, "text_hash": text_hash})

            if not candidates:
                return {
                    "status": "ok",
                    "service_date": target_date,
                    "model": active_model,
                    "dimension": 0,
                    "candidates": len(rows),
                    "embedded": 0,
                    "up_to_date": len(rows),
                }

            embedded = 0
            dimension = 0
            for batch in chunked(candidates, batch_size_from_env()):
                vectors = embed_passages([item["text"] for item in batch], active_model, active_cache_dir)
                upsert_rows = []
                for item, vector in zip(batch, vectors, strict=True):
                    normalized = normalize_vector(vector)
                    if not normalized:
                        continue
                    dimension = len(normalized)
                    row = item["row"]
                    upsert_rows.append((
                        target_date,
                        row["restaurant_id"],
                        row["meal_id"],
                        row["station_id"],
                        row["food_id"],
                        active_model,
                        dimension,
                        item["text_hash"],
                        encode_vector(normalized),
                    ))

                if upsert_rows:
                    cursor.executemany(
                        """
                        INSERT INTO food_search_embeddings (
                          service_date, restaurant_id, meal_id, station_id, food_id,
                          model, dimension, text_hash, embedding
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                        ON DUPLICATE KEY UPDATE
                          dimension = VALUES(dimension),
                          text_hash = VALUES(text_hash),
                          embedding = VALUES(embedding),
                          updated_at = CURRENT_TIMESTAMP
                        """,
                        upsert_rows,
                    )
                    embedded += len(upsert_rows)

            connection.commit()
            return {
                "status": "ok",
                "service_date": target_date,
                "model": active_model,
                "dimension": dimension,
                "candidates": len(rows),
                "embedded": embedded,
                "up_to_date": len(rows) - len(candidates),
            }
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def embed_query(text: str, model_name: str | None = None, cache_dir: str | None = None) -> list[float]:
    active_model = model_name or model_name_from_env()
    active_cache_dir = cache_dir if cache_dir is not None else cache_dir_from_env()
    model = get_embedding_model(active_model, active_cache_dir)
    vector = next(iter(model.query_embed(text)))
    return normalize_vector(vector)


def embed_passages(texts: Iterable[str], model_name: str, cache_dir: str | None) -> list[list[float]]:
    model = get_embedding_model(model_name, cache_dir)
    return [to_float_list(vector) for vector in model.passage_embed(list(texts), batch_size=batch_size_from_env())]


def get_embedding_model(model_name: str, cache_dir: str | None) -> Any:
    key = (model_name, cache_dir)
    if key not in _models:
        from fastembed import TextEmbedding

        _models[key] = TextEmbedding(model_name=model_name, cache_dir=cache_dir)
    return _models[key]


def connect(config: Any) -> pymysql.connections.Connection:
    return pymysql.connect(
        host=config.host,
        port=config.port,
        user=config.user,
        password=config.password,
        database=config.database,
        charset="utf8mb4",
        autocommit=False,
        cursorclass=pymysql.cursors.DictCursor,
    )


def embeddings_table_exists(cursor: pymysql.cursors.DictCursor) -> bool:
    cursor.execute("SHOW TABLES LIKE %s", ("food_search_embeddings",))
    return cursor.fetchone() is not None


def load_embedding_rows(cursor: pymysql.cursors.DictCursor, service_date: str) -> list[dict[str, Any]]:
    cursor.execute(
        """
        SELECT
          DATE_FORMAT(r.service_date, '%%Y-%%m-%%d') AS service_date,
          r.id AS restaurant_id,
          r.name AS restaurant_name,
          m.id AS meal_id,
          m.name AS meal_name,
          m.time_open AS meal_time_open,
          m.time_closed AS meal_time_closed,
          s.id AS station_id,
          s.name AS station_name,
          f.id AS food_id,
          f.short_name,
          f.full_name,
          f.description,
          f.ingredients,
          f.calories,
          f.total_fat,
          f.total_carbohydrates,
          f.protein,
          f.vegetarian,
          f.vegan,
          f.gluten_free,
          f.allergy_egg,
          f.allergy_shellfish,
          f.allergy_soy,
          f.allergy_peanut,
          f.allergy_wheat,
          f.allergy_tree_nut,
          f.allergy_milk,
          f.allergy_sesame,
          f.allergy_fish
        FROM restaurants r
        JOIN meals m ON m.restaurant_id = r.id
        JOIN stations s ON s.meal_id = m.id
        JOIN station_foods sf ON sf.station_id = s.id
        JOIN foods f ON f.id = sf.food_id
        WHERE r.service_date = %s
        ORDER BY r.name ASC, m.time_open ASC, s.name ASC, f.short_name ASC
        """,
        (service_date,),
    )
    return list(cursor.fetchall())


def load_existing_hashes(
    cursor: pymysql.cursors.DictCursor,
    service_date: str,
    model_name: str,
) -> dict[tuple[int, int, int, int], str]:
    cursor.execute(
        """
        SELECT restaurant_id, meal_id, station_id, food_id, text_hash
        FROM food_search_embeddings
        WHERE service_date = %s AND model = %s
        """,
        (service_date, model_name),
    )
    return {
        embedding_key(row): str(row["text_hash"])
        for row in cursor.fetchall()
    }


def embedding_key(row: dict[str, Any]) -> tuple[int, int, int, int]:
    return (
        int(row["restaurant_id"]),
        int(row["meal_id"]),
        int(row["station_id"]),
        int(row["food_id"]),
    )


def build_food_embedding_text(row: dict[str, Any]) -> str:
    dietary = []
    if row.get("vegan"):
        dietary.append("vegan")
    if row.get("vegetarian"):
        dietary.append("vegetarian")
    if row.get("gluten_free"):
        dietary.append("gluten free")

    allergens = [
        label
        for label, column in ALLERGEN_COLUMNS
        if row.get(column)
    ]

    parts = [
        f"Food: {clean_text(row.get('short_name'))}",
        f"Full name: {clean_text(row.get('full_name'))}",
        f"Description: {clean_text(row.get('description'))}",
        f"Ingredients: {clean_text(row.get('ingredients'))}",
        f"Restaurant: {clean_text(row.get('restaurant_name'))}",
        f"Meal: {clean_text(row.get('meal_name'))} {time_window(row.get('meal_time_open'), row.get('meal_time_closed'))}",
        f"Station: {clean_text(row.get('station_name'))}",
    ]
    if dietary:
        parts.append(f"Dietary: {', '.join(dietary)}")
    if allergens:
        parts.append(f"Contains allergens: {', '.join(allergens)}")

    return "\n".join(part for part in parts if part and not part.endswith(": "))


def time_window(open_value: Any, closed_value: Any) -> str:
    start = time_label(open_value)
    end = time_label(closed_value)
    if start and end:
        return f"({start} - {end})"
    return ""


def time_label(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%-I:%M %p")
    return clean_text(value)


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return str(value)
    return " ".join(str(value).split())


def to_float_list(vector: Any) -> list[float]:
    if hasattr(vector, "tolist"):
        vector = vector.tolist()
    return [float(value) for value in vector]


def normalize_vector(vector: Any) -> list[float]:
    values = to_float_list(vector)
    norm = math.sqrt(sum(value * value for value in values))
    if norm <= 0:
        return []
    return [value / norm for value in values]


def encode_vector(vector: list[float]) -> bytes:
    return struct.pack(f"<{len(vector)}f", *vector)


def chunked(items: list[Any], size: int) -> Iterable[list[Any]]:
    for index in range(0, len(items), size):
        yield items[index:index + size]


def env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None or value.strip() == "":
        return default
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default
