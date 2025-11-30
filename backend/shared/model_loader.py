"""
Utilities for downloading and caching ML models (e.g., YOLO ONNX weights).
"""
from __future__ import annotations

import os
import threading
from typing import Optional

import boto3
from botocore.exceptions import ClientError

try:
    import onnxruntime as ort  # type: ignore
except ImportError:  # pragma: no cover
    ort = None  # type: ignore

MODEL_CACHE_DIR = "/tmp/roof-models"
_session_cache: dict[str, "ort.InferenceSession"] = {}
_session_lock = threading.RLock()


def _ensure_cache_dir() -> None:
    os.makedirs(MODEL_CACHE_DIR, exist_ok=True)


def _safe_filename(bucket: str, key: str) -> str:
    sanitized = key.replace("/", "_")
    return f"{bucket}_{sanitized}"


def get_local_model_path(bucket: str, key: str) -> str:
    """
    Resolve the local cache path for a model key.
    """
    _ensure_cache_dir()
    filename = _safe_filename(bucket, key)
    return os.path.join(MODEL_CACHE_DIR, filename)


def download_model_if_needed(
    bucket: str,
    key: str,
    region: str = "us-east-2",
    force: bool = False,
) -> Optional[str]:
    """
    Ensure the requested model exists locally, downloading from S3 if necessary.
    """
    # Allow overriding via explicit local path (useful for tests/local dev)
    local_override = os.environ.get("MODEL_LOCAL_PATH")
    if local_override and os.path.isfile(local_override):
        return local_override

    local_path = get_local_model_path(bucket, key)
    if os.path.isfile(local_path) and not force:
        return local_path

    s3_client = boto3.client("s3", region_name=region)
    tmp_path = f"{local_path}.download"
    try:
        s3_client.download_file(bucket, key, tmp_path)
        os.replace(tmp_path, local_path)
        return local_path
    except ClientError as err:
        print(f"Failed to download model s3://{bucket}/{key}: {err}")
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        return None


def get_onnx_session(model_path: str) -> "ort.InferenceSession":
    """
    Lazily load and cache an ONNX runtime session for the given model path.
    """
    if ort is None:
        raise RuntimeError(
            "onnxruntime is not available. Include it in the Lambda package or layer."
        )

    with _session_lock:
        session = _session_cache.get(model_path)
        if session:
            return session
        session = ort.InferenceSession(
            model_path,
            providers=["CPUExecutionProvider"],
        )
        _session_cache[model_path] = session
        return session


def get_or_create_session(
    bucket: str,
    key: str,
    region: str = "us-east-2",
    force_download: bool = False,
) -> "ort.InferenceSession":
    """
    Download the requested model (if needed) and return an ONNX runtime session.
    """
    local_path = download_model_if_needed(bucket, key, region, force=force_download)
    if not local_path:
        raise FileNotFoundError(
            f"Unable to download YOLO model from s3://{bucket}/{key}"
        )
    return get_onnx_session(local_path)


__all__ = [
    "download_model_if_needed",
    "get_local_model_path",
    "get_onnx_session",
    "get_or_create_session",
]

