"""
Utilities that power the best-effort single-agent pipeline (YOLO + CV + GPT).
"""
from __future__ import annotations

import json
import os
from typing import Any, Dict, List, Optional, Sequence, Tuple

from .cv_utils import (
    count_damage_instances,
    detect_discoloration_cv,
    detect_exposed_underlayment_cv,
    detect_missing_shingles_cv,
    merge_damage_areas,
    filter_large_damage_areas,
)

try:
    import numpy as np  # type: ignore
except ImportError:  # pragma: no cover
    np = None
try:
    import cv2  # type: ignore
except ImportError:  # pragma: no cover
    cv2 = None


def _ensure_np_cv() -> None:
    if np is None or cv2 is None:
        raise RuntimeError(
            "NumPy/OpenCV missing. Attach the CvDependenciesLayer to this Lambda."
        )


def _letterbox(
    img: "np.ndarray",
    new_shape: int = 640,
    color: Tuple[int, int, int] = (114, 114, 114),
) -> Tuple["np.ndarray", Tuple[float, float], Tuple[float, float]]:
    """
    Resize image to square while preserving aspect ratio (YOLO-style letterbox).
    """
    _ensure_np_cv()
    shape = img.shape[:2]  # (h, w)
    if isinstance(new_shape, int):
        new_shape = (new_shape, new_shape)

    r = min(new_shape[0] / shape[0], new_shape[1] / shape[1])
    ratio = (r, r)

    new_unpad = (int(round(shape[1] * r)), int(round(shape[0] * r)))
    dw = (new_shape[1] - new_unpad[0]) / 2
    dh = (new_shape[0] - new_unpad[1]) / 2

    if shape[::-1] != new_unpad:
        img = cv2.resize(img, new_unpad, interpolation=cv2.INTER_LINEAR)

    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    img = cv2.copyMakeBorder(img, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)
    return img, ratio, (dw, dh)


def _clip_box(box: Sequence[float], width: int, height: int) -> List[int]:
    x1, y1, x2, y2 = box
    x1 = max(0, min(width - 1, int(x1)))
    y1 = max(0, min(height - 1, int(y1)))
    x2 = max(0, min(width, int(x2)))
    y2 = max(0, min(height, int(y2)))
    if x2 <= x1:
        x2 = min(width, x1 + 1)
    if y2 <= y1:
        y2 = min(height, y1 + 1)
    return [x1, y1, x2, y2]


def _nms(boxes: "np.ndarray", scores: "np.ndarray", iou_threshold: float) -> List[int]:
    """
    Basic NMS implementation for CPU inference.
    """
    idxs = scores.argsort()[::-1]
    keep: List[int] = []

    while idxs.size > 0:
        current = idxs[0]
        keep.append(int(current))
        if idxs.size == 1:
            break
        rest = idxs[1:]

        xx1 = np.maximum(boxes[current, 0], boxes[rest, 0])
        yy1 = np.maximum(boxes[current, 1], boxes[rest, 1])
        xx2 = np.minimum(boxes[current, 2], boxes[rest, 2])
        yy2 = np.minimum(boxes[current, 3], boxes[rest, 3])

        w = np.maximum(0, xx2 - xx1)
        h = np.maximum(0, yy2 - yy1)
        inter = w * h
        area_current = (boxes[current, 2] - boxes[current, 0]) * (boxes[current, 3] - boxes[current, 1])
        area_rest = (boxes[rest, 2] - boxes[rest, 0]) * (boxes[rest, 3] - boxes[rest, 1])
        union = area_current + area_rest - inter
        ious = inter / np.clip(union, a_min=1e-5, a_max=None)

        idxs = rest[ious <= iou_threshold]

    return keep


def run_yolo_inference(
    image_bytes: bytes,
    session: Any,
    class_names: Optional[List[str]] = None,
    conf_threshold: float = 0.3,
    iou_threshold: float = 0.45,
) -> List[Dict[str, Any]]:
    """
    Execute YOLO (ONNX) inference and return normalized damage detections.
    """
    _ensure_np_cv()
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    original_h, original_w = img.shape[:2]
    processed, ratio, dwdh = _letterbox(img, new_shape=session.get_inputs()[0].shape[-1])
    input_data = processed.transpose((2, 0, 1))  # CHW
    input_data = input_data.astype(np.float32) / 255.0
    input_data = np.expand_dims(input_data, axis=0)

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: input_data})
    predictions = outputs[0][0]  # (N, 4 + num_classes + obj)

    boxes = predictions[:, :4]
    objectness = predictions[:, 4]
    class_scores = predictions[:, 5:]
    if class_scores.size == 0:
        return []

    class_indices = np.argmax(class_scores, axis=1)
    class_conf = class_scores[np.arange(class_scores.shape[0]), class_indices]
    scores = objectness * class_conf

    valid = scores >= conf_threshold
    if not np.any(valid):
        return []

    boxes = boxes[valid]
    scores = scores[valid]
    class_indices = class_indices[valid]

    # Convert from center x/y/w/h to corners
    boxes_xyxy = np.zeros_like(boxes)
    boxes_xyxy[:, 0] = boxes[:, 0] - boxes[:, 2] / 2  # x1
    boxes_xyxy[:, 1] = boxes[:, 1] - boxes[:, 3] / 2  # y1
    boxes_xyxy[:, 2] = boxes[:, 0] + boxes[:, 2] / 2  # x2
    boxes_xyxy[:, 3] = boxes[:, 1] + boxes[:, 3] / 2  # y2

    # Undo letterbox scaling
    boxes_xyxy[:, [0, 2]] -= dwdh[0]
    boxes_xyxy[:, [1, 3]] -= dwdh[1]
    boxes_xyxy[:, [0, 2]] /= ratio[0]
    boxes_xyxy[:, [1, 3]] /= ratio[1]

    keep_indices = _nms(boxes_xyxy, scores, iou_threshold)

    default_classes = [
        "missing_shingles",
        "cracks",
        "hail_impact",
        "granule_loss",
        "discoloration",
    ]
    labels = class_names or default_classes

    detections: List[Dict[str, Any]] = []
    for idx in keep_indices:
        class_id = int(class_indices[idx])
        label = labels[class_id] if class_id < len(labels) else f"class_{class_id}"
        bbox = _clip_box(boxes_xyxy[idx], original_w, original_h)
        detections.append(
            {
                "bbox": bbox,
                "confidence": float(scores[idx]),
                "damage_type": label,
                "source": "yolo",
                "model_class_id": class_id,
            }
        )

    return detections


def enrich_with_cv(
    image_bytes: bytes,
    detections: List[Dict[str, Any]],
    min_area_missing: int = 400,
    min_area_discoloration: int = 600,
    min_area_underlayment: int = 300,
) -> List[Dict[str, Any]]:
    """
    Merge YOLO detections with CV heuristics for redundancy and recall.
    """
    cv_missing = detect_missing_shingles_cv(image_bytes, min_area=min_area_missing)
    merged = merge_damage_areas(detections, cv_missing, iou_threshold=0.35)

    cv_discoloration = detect_discoloration_cv(image_bytes, min_area=min_area_discoloration)
    merged = merge_damage_areas(merged, cv_discoloration, iou_threshold=0.3)

    # Detect exposed underlayment (tan/brown patches - very common damage indicator)
    cv_underlayment = detect_exposed_underlayment_cv(image_bytes, min_area=min_area_underlayment)
    merged = merge_damage_areas(merged, cv_underlayment, iou_threshold=0.3)

    return merged


def summarize_with_ai(
    ai_client: Any,
    image_bytes: bytes,
    detections: List[Dict[str, Any]],
    extra_notes: Optional[str] = None,
) -> Tuple[str, str, Optional[str], Dict[str, Any]]:
    """
    Ask GPT-4o/OpenRouter for a textual summary & recommendations.
    """
    if not ai_client:
        return ("AI client unavailable", "Unable to compile recommendations", None, {})

    prompt = """You are a senior roof inspector. Analyze this roof image and detections JSON.
Detections JSON:
{detections}

Provide a concise JSON response:
{{
  "summary": "one paragraph highlighting the most critical damage, referencing approximate counts",
  "recommendations": "actionable remediation plan (<80 words)",
  "high_priority_areas": [
    {{
      "damage_type": "...",
      "approx_location": "short description (north ridge, central field, etc.)"
    }}
  ]
}}

Strictly return JSON.
"""

    payload = {
        "detections": detections,
        "notes": extra_notes or "",
        "counts": count_damage_instances(detections),
    }
    response, provider = ai_client.detect_content(
        image_bytes,
        prompt.format(detections=json.dumps(payload, default=str)),
    )
    if not response:
        return (
            "Unable to retrieve AI summary.",
            "Review roof manually; AI response failed.",
            provider if provider != "error" else None,
            {},
        )

    summary = response.get("summary", "No summary provided.")
    recommendations = response.get("recommendations", "No recommendations provided.")
    return (
        summary,
        recommendations,
        provider if provider != "error" else None,
        response,
    )


__all__ = [
    "run_yolo_inference",
    "enrich_with_cv",
    "summarize_with_ai",
    "filter_large_damage_areas",
]

