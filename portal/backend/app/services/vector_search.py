"""ベクターサーチバックエンド抽象層。
VECTOR_SEARCH_BACKEND 環境変数で実装を切り替える。
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from backend.app.config import get_settings


class VectorSearchBackend(ABC):
    @abstractmethod
    def search(
        self,
        query_vector: list[float],
        catalog_names: list[str],
        limit: int,
        score_threshold: float,
        time_from: Optional[str] = None,
        time_to: Optional[str] = None,
        vehicle_ids: Optional[list[str]] = None,
    ) -> list[dict]: ...

    @abstractmethod
    def get_frame_by_id(self, scene_id: str) -> dict: ...


# ── S3 Vectors ────────────────────────────────────────────────────────────────


class S3VectorsBackend(VectorSearchBackend):
    def __init__(self, bucket: str, index: str, region: str) -> None:
        import boto3  # noqa: PLC0415

        self._client = boto3.client("s3vectors", region_name=region)
        self._bucket = bucket
        self._index = index

    def search(
        self,
        query_vector: list[float],
        catalog_names: list[str],
        limit: int,
        score_threshold: float,
        time_from: Optional[str] = None,
        time_to: Optional[str] = None,
        vehicle_ids: Optional[list[str]] = None,
    ) -> list[dict]:
        catalog_filter = " OR ".join(f"catalog_name = '{c}'" for c in catalog_names) or "1=1"
        time_filter = ""
        if time_from and time_to:
            time_filter = f" AND recorded_at >= '{time_from}' AND recorded_at <= '{time_to}'"
        vehicle_filter = ""
        if vehicle_ids:
            vehicle_filter = " AND (" + " OR ".join(f"vehicle_id = '{v}'" for v in vehicle_ids) + ")"

        result = self._client.query_vectors(
            VectorBucketName=self._bucket,
            IndexName=self._index,
            QueryVector={"Float32": query_vector},
            TopK=limit,
            Filter=f"({catalog_filter}){time_filter}{vehicle_filter}",
            ReturnMetadata=True,
            ReturnDistance=True,
        )
        return [
            {
                "scene_id": v["Key"],
                "vehicle_id": v["Metadata"]["vehicle_id"],
                "recorded_at": v["Metadata"]["recorded_at"],
                "similarity_score": 1 - v["Distance"],
                "latitude": float(v["Metadata"]["latitude"]),
                "longitude": float(v["Metadata"]["longitude"]),
                "thumbnail_s3_key": v["Metadata"]["thumbnail_s3_key"],
                "video_s3_key": v["Metadata"]["video_s3_key"],
                "clip_s3_key": v["Metadata"]["clip_s3_key"],
                "clip_offset_sec": float(v["Metadata"]["clip_offset_sec"]),
            }
            for v in result["Vectors"]
            if 1 - v["Distance"] >= score_threshold
        ]

    def get_frame_by_id(self, scene_id: str) -> dict:
        result = self._client.get_vectors(
            VectorBucketName=self._bucket,
            IndexName=self._index,
            Keys=[scene_id],
            ReturnMetadata=True,
        )
        m = result["Vectors"][0]["Metadata"]
        return {
            "vehicle_id": m["vehicle_id"],
            "recorded_at": m["recorded_at"],
            "thumbnail_s3_key": m["thumbnail_s3_key"],
            "video_s3_key": m["video_s3_key"],
            "clip_s3_key": m["clip_s3_key"],
            "clip_offset_sec": float(m["clip_offset_sec"]),
        }


# ── Qdrant ────────────────────────────────────────────────────────────────────


class QdrantBackend(VectorSearchBackend):
    def __init__(self, url: str, api_key: str, collection: str) -> None:
        from qdrant_client import QdrantClient  # noqa: PLC0415

        self._client = QdrantClient(url=url, api_key=api_key or None)
        self._collection = collection

    def search(
        self,
        query_vector: list[float],
        catalog_names: list[str],
        limit: int,
        score_threshold: float,
        time_from: Optional[str] = None,
        time_to: Optional[str] = None,
        vehicle_ids: Optional[list[str]] = None,
    ) -> list[dict]:
        from qdrant_client.models import (  # noqa: PLC0415
            DatetimeRange,
            FieldCondition,
            Filter,
            MatchAny,
        )

        must: list = [
            FieldCondition(key="catalog_name", match=MatchAny(any=catalog_names)),
        ]
        if time_from and time_to:
            from datetime import datetime  # noqa: PLC0415

            must.append(
                FieldCondition(
                    key="recorded_at",
                    range=DatetimeRange(
                        gte=datetime.fromisoformat(time_from),
                        lte=datetime.fromisoformat(time_to),
                    ),
                )
            )
        if vehicle_ids:
            must.append(FieldCondition(key="vehicle_id", match=MatchAny(any=vehicle_ids)))

        results = self._client.query_points(
            collection_name=self._collection,
            query=query_vector,
            limit=limit,
            score_threshold=score_threshold,
            query_filter=Filter(must=must),
            with_payload=True,
        )
        return [
            {
                "scene_id": str(r.id),
                "vehicle_id": p["vehicle_id"],
                "recorded_at": p["recorded_at"],
                "similarity_score": r.score,
                "latitude": p["latitude"],
                "longitude": p["longitude"],
                "thumbnail_s3_key": p["thumbnail_s3_key"],
                "video_s3_key": p["video_s3_key"],
                "clip_s3_key": p["clip_s3_key"],
                "clip_offset_sec": p["clip_offset_sec"],
            }
            for r in results.points
            if (p := r.payload) is not None
        ]

    def get_frame_by_id(self, scene_id: str) -> dict:
        points = self._client.retrieve(
            collection_name=self._collection,
            ids=[scene_id],
            with_payload=True,
        )
        payload = points[0].payload
        assert payload is not None
        return payload


# ── pgvector ──────────────────────────────────────────────────────────────────


class PgVectorBackend(VectorSearchBackend):
    def __init__(self, connection_string: str) -> None:
        self._conn_str = connection_string

    def _connect(self):
        import psycopg2  # noqa: PLC0415
        from pgvector.psycopg2 import register_vector  # noqa: PLC0415

        conn = psycopg2.connect(self._conn_str)
        register_vector(conn)
        return conn

    def search(
        self,
        query_vector: list[float],
        catalog_names: list[str],
        limit: int,
        score_threshold: float,
        time_from: Optional[str] = None,
        time_to: Optional[str] = None,
        vehicle_ids: Optional[list[str]] = None,
    ) -> list[dict]:
        import numpy as np  # noqa: PLC0415

        conditions = [
            "catalog_name = ANY(%s)",
            "1 - (embedding <=> %s::vector) >= %s",
        ]
        params: list = [catalog_names, np.array(query_vector), score_threshold]

        if time_from and time_to:
            conditions.append("recorded_at BETWEEN %s AND %s")
            params.extend([time_from, time_to])
        if vehicle_ids:
            conditions.append("vehicle_id = ANY(%s)")
            params.append(vehicle_ids)

        params.append(np.array(query_vector))
        params.append(limit)

        sql = f"""
            SELECT frame_id, vehicle_id, recorded_at, latitude, longitude,
                   thumbnail_s3_key, video_s3_key, clip_s3_key, clip_offset_sec,
                   1 - (embedding <=> %s::vector) AS similarity_score
            FROM video_frames
            WHERE {" AND ".join(conditions)}
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                cols = [d[0] for d in cur.description]
                rows = [dict(zip(cols, row)) for row in cur.fetchall()]
        finally:
            conn.close()

        return [
            {
                "scene_id": str(r["frame_id"]),
                "vehicle_id": r["vehicle_id"],
                "recorded_at": r["recorded_at"].isoformat()
                if hasattr(r["recorded_at"], "isoformat")
                else r["recorded_at"],
                "similarity_score": float(r["similarity_score"]),
                "latitude": float(r["latitude"]),
                "longitude": float(r["longitude"]),
                "thumbnail_s3_key": r["thumbnail_s3_key"],
                "video_s3_key": r["video_s3_key"],
                "clip_s3_key": r["clip_s3_key"],
                "clip_offset_sec": float(r["clip_offset_sec"]),
            }
            for r in rows
        ]

    def get_frame_by_id(self, scene_id: str) -> dict:
        conn = self._connect()
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT * FROM video_frames WHERE frame_id = %s", (scene_id,))
                cols = [d[0] for d in cur.description]
                row = dict(zip(cols, cur.fetchone()))
        finally:
            conn.close()
        return row


# ── Databricks Vector Search ──────────────────────────────────────────────────


class DatabricksVectorBackend(VectorSearchBackend):
    def __init__(self, endpoint: str, index: str) -> None:
        from databricks.vector_search.client import VectorSearchClient  # noqa: PLC0415

        self._index = VectorSearchClient().get_index(
            endpoint_name=endpoint,
            index_name=index,
        )
        settings = get_settings()
        self._data_index = index  # used for single-frame lookup
        self._settings = settings

    def search(
        self,
        query_vector: list[float],
        catalog_names: list[str],
        limit: int,
        score_threshold: float,
        time_from: Optional[str] = None,
        time_to: Optional[str] = None,
        vehicle_ids: Optional[list[str]] = None,
    ) -> list[dict]:
        filters: dict = {"catalog_name": catalog_names}
        if time_from:
            filters["recorded_at >="] = time_from
        if time_to:
            filters["recorded_at <="] = time_to
        if vehicle_ids:
            filters["vehicle_id"] = vehicle_ids

        results = self._index.similarity_search(
            query_vector=query_vector,
            columns=[
                "frame_id",
                "vehicle_id",
                "recorded_at",
                "latitude",
                "longitude",
                "thumbnail_s3_key",
                "video_s3_key",
                "clip_s3_key",
                "clip_offset_sec",
            ],
            filters=filters,
            num_results=limit,
            score_threshold=score_threshold,
        )
        return [
            {
                "scene_id": row["frame_id"],
                "vehicle_id": row["vehicle_id"],
                "recorded_at": row["recorded_at"],
                "similarity_score": row["score"],
                "latitude": float(row["latitude"]),
                "longitude": float(row["longitude"]),
                "thumbnail_s3_key": row["thumbnail_s3_key"],
                "video_s3_key": row["video_s3_key"],
                "clip_s3_key": row["clip_s3_key"],
                "clip_offset_sec": float(row["clip_offset_sec"]),
            }
            for row in results.get("result", {}).get("data_array", [])
        ]

    def get_frame_by_id(self, scene_id: str) -> dict:
        from app.services import databricks as db_svc  # noqa: PLC0415

        rows = db_svc.execute_sql(
            "SELECT * FROM video.frame_embeddings WHERE frame_id = ?",
            (scene_id,),
        )
        return rows[0] if rows else {}


# ── Factory ───────────────────────────────────────────────────────────────────


def get_vector_backend() -> VectorSearchBackend:
    settings = get_settings()
    backend = settings.vector_search_backend
    if backend == "s3vectors":
        return S3VectorsBackend(
            settings.s3_vectors_bucket,
            settings.s3_vectors_index,
            settings.aws_region,
        )
    if backend == "qdrant":
        return QdrantBackend(
            settings.qdrant_url,
            settings.qdrant_api_key,
            settings.qdrant_collection,
        )
    if backend == "pgvector":
        return PgVectorBackend(settings.pgvector_connection_string)
    return DatabricksVectorBackend(
        settings.databricks_vector_search_endpoint,
        settings.databricks_vector_search_index,
    )
