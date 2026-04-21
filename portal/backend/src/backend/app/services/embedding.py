"""Embedding Lambda クライアント。
クエリテキストをベクトルに変換する。
DEV_MODE=true の場合はゼロベクトルを返す（Lambda 不要）。
"""

from __future__ import annotations

import json

from backend.app.config import get_settings


def embed_query(query_text: str) -> list[float]:
    """Embedding Lambda を同期 invoke してベクトルを取得する。"""
    settings = get_settings()

    if settings.dev_mode:
        return [0.0] * settings.frame_embed_dim

    import boto3  # noqa: PLC0415 — 本番時のみロード

    client = boto3.client("lambda", region_name=settings.aws_region)
    response = client.invoke(
        FunctionName=settings.embedding_lambda_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(
            {
                "query": query_text,
                "embed_mode": settings.frame_embed_mode,
                "model_name": settings.embed_model_name,
            }
        ),
    )
    return json.loads(response["Payload"].read())["vector"]
