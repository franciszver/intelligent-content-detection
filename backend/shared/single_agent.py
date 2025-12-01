"""
Utilities that power the best-effort single-agent pipeline (YOLO + CV + GPT).
"""
from __future__ import annotations

import json
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


def detect_roof_boundary(img: "np.ndarray") -> Optional["np.ndarray"]:
    """
    Detect the roof region using HSV color segmentation.
    Returns a binary mask where roof pixels are 255, background is 0.
    Falls back to excluding top 15% of image if no roof colors detected.
    """
    _ensure_np_cv()
    h, w = img.shape[:2]
    
    # Convert to HSV for color-based segmentation
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    
    # Detect sky regions (high brightness, low saturation, blue-ish hue)
    # Sky typically has H: 90-130, S: 0-80, V: 150-255
    sky_mask = cv2.inRange(hsv, (90, 0, 150), (130, 80, 255))
    
    # Also detect very bright areas (overexposed sky)
    bright_mask = cv2.inRange(hsv, (0, 0, 200), (180, 40, 255))
    sky_mask = cv2.bitwise_or(sky_mask, bright_mask)
    
    # Detect common roof colors:
    # Gray shingles: low saturation, medium value
    gray_roof = cv2.inRange(hsv, (0, 0, 40), (180, 60, 180))
    # Brown/tan shingles: warm hues, medium saturation
    brown_roof = cv2.inRange(hsv, (5, 30, 40), (25, 180, 200))
    # Dark shingles (black/dark gray)
    dark_roof = cv2.inRange(hsv, (0, 0, 20), (180, 80, 100))
    # Red/terracotta tiles
    red_roof = cv2.inRange(hsv, (0, 50, 50), (15, 200, 200))
    
    # Combine all roof-like colors
    roof_colors = cv2.bitwise_or(gray_roof, brown_roof)
    roof_colors = cv2.bitwise_or(roof_colors, dark_roof)
    roof_colors = cv2.bitwise_or(roof_colors, red_roof)
    
    # Start with the color-based roof detection
    roof_mask = roof_colors.copy()
    
    # Remove sky regions
    roof_mask = cv2.bitwise_and(roof_mask, cv2.bitwise_not(sky_mask))
    
    # Apply morphological operations to clean up
    kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    roof_mask = cv2.morphologyEx(roof_mask, cv2.MORPH_CLOSE, kernel_close)
    
    kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (10, 10))
    roof_mask = cv2.morphologyEx(roof_mask, cv2.MORPH_OPEN, kernel_open)
    
    # Find the largest contour (likely the main roof)
    contours, _ = cv2.findContours(roof_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        # Fallback: assume center region is roof, exclude top 15% (sky)
        fallback_mask = np.zeros((h, w), dtype=np.uint8)
        fallback_mask[int(h * 0.15):, :] = 255
        return fallback_mask
    
    # Keep contours that are reasonably large (> 5% of image area)
    min_area = h * w * 0.05
    large_contours = [c for c in contours if cv2.contourArea(c) > min_area]
    
    if not large_contours:
        # Fallback mask
        fallback_mask = np.zeros((h, w), dtype=np.uint8)
        fallback_mask[int(h * 0.15):, :] = 255
        return fallback_mask
    
    # Create final mask from large contours
    final_mask = np.zeros((h, w), dtype=np.uint8)
    cv2.drawContours(final_mask, large_contours, -1, 255, -1)
    
    # Expand mask slightly to include edges
    final_mask = cv2.dilate(final_mask, kernel_close, iterations=1)
    
    return final_mask


def filter_detections_by_location(
    detections: List[Dict[str, Any]],
    img_width: int,
    img_height: int,
    roof_mask: Optional["np.ndarray"] = None,
    top_margin_pct: float = 0.12,
    edge_margin_pct: float = 0.03,
    min_roof_overlap_pct: float = 0.3,
) -> List[Dict[str, Any]]:
    """
    Filter detections based on location heuristics:
    - Remove detections in top portion of image (likely sky)
    - Remove detections too close to edges
    - If roof_mask provided, only keep detections with sufficient overlap
    
    Args:
        detections: List of detection dicts with 'bbox' key
        img_width, img_height: Image dimensions
        roof_mask: Optional binary mask of roof region
        top_margin_pct: Fraction of image height to exclude from top (sky filter)
        edge_margin_pct: Fraction of image to exclude from edges
        min_roof_overlap_pct: Minimum overlap with roof mask to keep detection
    
    Returns:
        Filtered list of detections
    """
    _ensure_np_cv()
    
    top_cutoff = int(img_height * top_margin_pct)
    edge_margin = int(min(img_width, img_height) * edge_margin_pct)
    
    filtered = []
    for det in detections:
        bbox = det.get("bbox", [0, 0, 0, 0])
        x1, y1, x2, y2 = bbox
        
        # Calculate detection center
        cx = (x1 + x2) / 2
        cy = (y1 + y2) / 2
        
        # Skip if center is in top margin (sky)
        if cy < top_cutoff:
            continue
        
        # Skip if center is too close to edges
        if cx < edge_margin or cx > (img_width - edge_margin):
            continue
        if cy > (img_height - edge_margin):  # bottom edge
            continue
        
        # If roof mask provided, check overlap
        if roof_mask is not None:
            # Use integer coordinates consistently for area calculation
            ix1, iy1 = max(0, int(x1)), max(0, int(y1))
            ix2, iy2 = min(img_width, int(x2)), min(img_height, int(y2))
            
            det_width = ix2 - ix1
            det_height = iy2 - iy1
            if det_width <= 0 or det_height <= 0:
                continue
            
            det_area = det_width * det_height
            
            # Extract detection region from mask
            mask_region = roof_mask[iy1:iy2, ix1:ix2]
            
            if mask_region.size == 0:
                continue
            
            # Calculate what fraction of detection overlaps with roof
            roof_pixels = np.sum(mask_region > 0)
            overlap_pct = roof_pixels / det_area
            
            if overlap_pct < min_roof_overlap_pct:
                continue
        
        filtered.append(det)
    
    return filtered


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
    filter_by_roof: bool = True,
) -> List[Dict[str, Any]]:
    """
    Execute YOLO (ONNX) inference and return normalized damage detections.
    
    Args:
        image_bytes: Raw image bytes
        session: ONNX inference session
        class_names: Optional list of class names
        conf_threshold: Minimum confidence threshold
        iou_threshold: IoU threshold for NMS
        filter_by_roof: If True, detect roof boundary and filter detections
    """
    _ensure_np_cv()
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    original_h, original_w = img.shape[:2]
    
    # Detect roof boundary for filtering
    roof_mask = None
    if filter_by_roof:
        roof_mask = detect_roof_boundary(img)
    processed, ratio, dwdh = _letterbox(img, new_shape=session.get_inputs()[0].shape[-1])
    input_data = processed.transpose((2, 0, 1))  # CHW
    input_data = input_data.astype(np.float32) / 255.0
    input_data = np.expand_dims(input_data, axis=0)

    input_name = session.get_inputs()[0].name
    outputs = session.run(None, {input_name: input_data})
    
    # Handle different YOLO output formats
    raw_output = outputs[0]
    
    # YOLOv8 outputs shape (1, num_classes+4, num_detections) and needs transpose
    # YOLOv5 outputs shape (1, num_detections, num_classes+5)
    if len(raw_output.shape) == 3:
        if raw_output.shape[1] < raw_output.shape[2]:
            # YOLOv8 format: (1, 84, 8400) -> transpose to (8400, 84)
            predictions = raw_output[0].T
        else:
            # YOLOv5 format: (1, 8400, 85) -> (8400, 85)
            predictions = raw_output[0]
    else:
        predictions = raw_output[0]

    boxes = predictions[:, :4]
    class_scores = predictions[:, 4:]  # YOLOv8 has no separate objectness
    
    if class_scores.size == 0:
        return []

    class_indices = np.argmax(class_scores, axis=1)
    scores = class_scores[np.arange(class_scores.shape[0]), class_indices]
    
    # Ensure scores are in valid range [0, 1]
    scores = np.clip(scores, 0.0, 1.0)

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

    # HuggingFace jobejaranom/yolo-roof-damage model has single class "item"
    # We rename it to "roof_damage" for better UX
    default_classes = ["roof_damage"]
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

    # Filter detections by location (remove sky, edges, non-roof areas)
    if filter_by_roof:
        detections = filter_detections_by_location(
            detections,
            original_w,
            original_h,
            roof_mask=roof_mask,
            top_margin_pct=0.12,  # Exclude top 12% (sky)
            edge_margin_pct=0.03,  # Exclude 3% from edges
            min_roof_overlap_pct=0.3,  # Detection must be 30% on roof
        )

    return detections


def enrich_with_cv(
    image_bytes: bytes,
    detections: List[Dict[str, Any]],
    min_area_missing: int = 400,
    min_area_discoloration: int = 600,
    min_area_underlayment: int = 300,
    filter_by_roof: bool = True,
) -> List[Dict[str, Any]]:
    """
    Merge YOLO detections with CV heuristics for redundancy and recall.
    Optionally filters all detections to roof-only regions.
    """
    _ensure_np_cv()
    
    # Get image dimensions and roof mask for filtering
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return detections
    
    img_h, img_w = img.shape[:2]
    roof_mask = detect_roof_boundary(img) if filter_by_roof else None
    
    cv_missing = detect_missing_shingles_cv(image_bytes, min_area=min_area_missing)
    merged = merge_damage_areas(detections, cv_missing, iou_threshold=0.35)

    cv_discoloration = detect_discoloration_cv(image_bytes, min_area=min_area_discoloration)
    merged = merge_damage_areas(merged, cv_discoloration, iou_threshold=0.3)

    # Detect exposed underlayment (tan/brown patches - very common damage indicator)
    cv_underlayment = detect_exposed_underlayment_cv(image_bytes, min_area=min_area_underlayment)
    merged = merge_damage_areas(merged, cv_underlayment, iou_threshold=0.3)

    # Filter all detections by location (remove sky, edges, non-roof areas)
    if filter_by_roof:
        merged = filter_detections_by_location(
            merged,
            img_w,
            img_h,
            roof_mask=roof_mask,
            top_margin_pct=0.12,
            edge_margin_pct=0.03,
            min_roof_overlap_pct=0.3,
        )

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
    "detect_roof_boundary",
    "filter_detections_by_location",
]

