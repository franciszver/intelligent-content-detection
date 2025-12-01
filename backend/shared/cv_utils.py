"""
Computer vision utilities for image processing and analysis
"""
import io
import json
from typing import List, Dict, Any, Tuple, Optional
try:
    import numpy as np  # type: ignore
except ImportError:  # pragma: no cover
    np = None
from PIL import Image, ImageDraw, ImageFont
try:
    import cv2  # type: ignore
except ImportError:  # pragma: no cover
    cv2 = None

# AIClient will be passed as parameter to functions that need it
# This avoids circular imports since ai_client is in lambda directories
AIClient = None  # Type hint, actual client passed at runtime


def _ensure_cv2_available() -> None:
    """Ensure cv2 is available before running CV-heavy routines."""
    if cv2 is None:
        raise ImportError(
            "OpenCV (cv2) is not available. Attach the CvDependenciesLayer to this Lambda."
        )


def _ensure_numpy_available() -> None:
    """Ensure numpy is available before running numpy-dependent routines."""
    if np is None:
        raise ImportError(
            "NumPy is not available. Attach the CvDependenciesLayer to this Lambda."
        )


def _clamp_bbox(bbox: List[int], width: int, height: int) -> List[int]:
    """Clamp a bounding box to stay within image boundaries."""
    x1, y1, x2, y2 = bbox
    x1 = max(0, min(width - 1, x1))
    y1 = max(0, min(height - 1, y1))
    x2 = max(0, min(width, x2))
    y2 = max(0, min(height, y2))
    if x2 <= x1:
        x2 = x1 + 1
    if y2 <= y1:
        y2 = y1 + 1
    return [x1, y1, x2, y2]


def _chunk_damage_areas(damage_areas: List[Dict[str, Any]], size: int = 5) -> List[List[Dict[str, Any]]]:
    """Split damage areas into smaller chunks for AI prompts."""
    return [damage_areas[i:i + size] for i in range(0, len(damage_areas), size)]


def detect_missing_shingles_cv(image_bytes: bytes, min_area: int = 400) -> List[Dict[str, Any]]:
    """
    Detect missing or mismatched shingles using classical CV routines.
    """
    _ensure_cv2_available()
    _ensure_numpy_available()

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    height, width = img.shape[:2]
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_channel, _, _ = cv2.split(lab)

    blur = cv2.GaussianBlur(l_channel, (5, 5), 0)
    median = cv2.medianBlur(l_channel, 21)
    diff = cv2.absdiff(blur, median)
    if diff.max() > 0:
        _, diff_mask = cv2.threshold(diff, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    else:
        _, diff_mask = cv2.threshold(diff, 8, 255, cv2.THRESH_BINARY)

    edges = cv2.Canny(blur, 40, 120)

    color_blur = cv2.GaussianBlur(img, (9, 9), 0)
    color_diff = cv2.absdiff(img, color_blur)
    color_gray = cv2.cvtColor(color_diff, cv2.COLOR_BGR2GRAY)
    _, color_mask = cv2.threshold(color_gray, 15, 255, cv2.THRESH_BINARY)

    combined = cv2.bitwise_or(diff_mask, edges)
    combined = cv2.bitwise_or(combined, color_mask)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel, iterations=2)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel, iterations=1)

    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    results: List[Dict[str, Any]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        # Aspect ratio filter removed to improve recall (can be re-enabled if needed)
        # aspect_ratio = w / float(h) if h > 0 else 0
        # if aspect_ratio < 0.6 or aspect_ratio > 6:
        #     continue

        bbox = _clamp_bbox([x, y, x + w, y + h], width, height)
        confidence = float(min(0.95, 0.4 + (area / (width * height)) * 3))
        results.append({
            "bbox": bbox,
            "confidence": confidence,
            "damage_type": "missing_shingles",
            "source": "cv"
        })

    return results


def detect_exposed_underlayment_cv(image_bytes: bytes, min_area: int = 300) -> List[Dict[str, Any]]:
    """
    Detect exposed underlayment (tan/brown patches) which indicate missing shingles.
    Uses HSV color range detection for tan/brown/beige colors.
    """
    _ensure_cv2_available()
    _ensure_numpy_available()

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    height, width = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Tan/brown/beige color ranges (exposed underlayment, plywood, tar paper)
    # Range 1: Light tan/beige
    lower_tan1 = np.array([10, 30, 100])
    upper_tan1 = np.array([25, 150, 230])
    mask1 = cv2.inRange(hsv, lower_tan1, upper_tan1)

    # Range 2: Darker brown/tan
    lower_tan2 = np.array([8, 50, 80])
    upper_tan2 = np.array([20, 180, 200])
    mask2 = cv2.inRange(hsv, lower_tan2, upper_tan2)

    # Range 3: Orange-ish brown (rusted/weathered)
    lower_orange = np.array([5, 80, 100])
    upper_orange = np.array([15, 200, 220])
    mask3 = cv2.inRange(hsv, lower_orange, upper_orange)

    # Combine all masks
    mask = cv2.bitwise_or(mask1, mask2)
    mask = cv2.bitwise_or(mask, mask3)

    # Morphological operations to clean up
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 7))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel, iterations=1)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    results: List[Dict[str, Any]] = []

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        bbox = _clamp_bbox([x, y, x + w, y + h], width, height)

        # Higher confidence for larger patches (more likely real damage)
        confidence = float(min(0.92, 0.5 + (area / (width * height)) * 8))

        results.append({
            "bbox": bbox,
            "confidence": confidence,
            "damage_type": "exposed_underlayment",
            "source": "cv_color"
        })

    return results


def detect_dark_patches_cv(image_bytes: bytes, min_area: int = 250) -> List[Dict[str, Any]]:
    """
    Detect dark patches (black/dark gray exposed areas) which indicate missing shingles
    or exposed tar paper/dark underlayment. Very common damage pattern.
    """
    _ensure_cv2_available()
    _ensure_numpy_available()

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    height, width = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Calculate image statistics to adapt thresholds
    mean_brightness = np.mean(gray)
    
    # Dark patch detection - low value (brightness) in HSV
    # Adjust threshold based on overall image brightness
    dark_threshold = max(40, min(80, int(mean_brightness * 0.4)))
    
    # Range 1: Very dark areas (black tar paper, deep shadows in gaps)
    lower_dark1 = np.array([0, 0, 0])
    upper_dark1 = np.array([180, 255, dark_threshold])
    mask_dark = cv2.inRange(hsv, lower_dark1, upper_dark1)

    # Range 2: Dark gray areas
    lower_dark2 = np.array([0, 0, dark_threshold])
    upper_dark2 = np.array([180, 60, dark_threshold + 40])
    mask_gray = cv2.inRange(hsv, lower_dark2, upper_dark2)

    # Combine masks
    mask = cv2.bitwise_or(mask_dark, mask_gray)

    # Use adaptive thresholding on grayscale to find locally dark regions
    # This helps find dark patches relative to surrounding shingles
    blur = cv2.GaussianBlur(gray, (21, 21), 0)
    adaptive_dark = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 15
    )
    
    # Combine with color-based detection
    mask = cv2.bitwise_or(mask, adaptive_dark)

    # Morphological operations to clean up and connect nearby dark regions
    kernel_small = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    kernel_large = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    
    # Close gaps between nearby dark patches
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel_large, iterations=2)
    # Remove noise
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel_small, iterations=1)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    results: List[Dict[str, Any]] = []

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue

        x, y, w, h = cv2.boundingRect(contour)
        
        # Filter out very thin or very wide detections (likely edges, not gaps)
        aspect_ratio = w / float(h) if h > 0 else 0
        if aspect_ratio < 0.15 or aspect_ratio > 8:
            continue

        bbox = _clamp_bbox([x, y, x + w, y + h], width, height)

        # Calculate how dark this region actually is
        roi = gray[y:y+h, x:x+w]
        if roi.size > 0:
            region_darkness = 1.0 - (np.mean(roi) / 255.0)
        else:
            region_darkness = 0.5

        # Confidence based on size and darkness
        size_factor = min(1.0, (area / (width * height)) * 15)
        confidence = float(min(0.88, 0.45 + (size_factor * 0.25) + (region_darkness * 0.2)))

        results.append({
            "bbox": bbox,
            "confidence": confidence,
            "damage_type": "missing_shingles",
            "source": "cv_dark_patch"
        })

    return results


def detect_discoloration_cv(image_bytes: bytes, min_area: int = 600) -> List[Dict[str, Any]]:
    """Detect discoloration or staining using LAB color analysis."""
    _ensure_cv2_available()
    _ensure_numpy_available()

    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return []

    height, width = img.shape[:2]
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l_channel, a_channel, _ = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l_channel)

    blur = cv2.GaussianBlur(l_enhanced, (7, 7), 0)
    adaptive = cv2.adaptiveThreshold(blur, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
                                     cv2.THRESH_BINARY_INV, 33, 5)

    texture = cv2.Laplacian(a_channel, cv2.CV_64F)
    texture = cv2.convertScaleAbs(texture)
    _, texture_mask = cv2.threshold(texture, 10, 255, cv2.THRESH_BINARY)

    mask = cv2.bitwise_or(adaptive, texture_mask)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    results: List[Dict[str, Any]] = []
    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area:
            continue
        x, y, w, h = cv2.boundingRect(contour)
        bbox = _clamp_bbox([x, y, x + w, y + h], width, height)
        confidence = float(min(0.9, 0.3 + (area / (width * height)) * 4))
        results.append({
            "bbox": bbox,
            "confidence": confidence,
            "damage_type": "discoloration",
            "discoloration_severity": min(1.0, 0.4 + confidence),
            "source": "cv"
        })
    return results


def annotate_damage_with_ai(image_bytes: bytes,
                            damage_areas: List[Dict[str, Any]],
                            ai_client: Optional[Any],
                            task: str = "missing_shingles") -> List[Dict[str, Any]]:
    """Use the AI client to classify/label detected damage areas."""
    if not ai_client or not damage_areas:
        return damage_areas

    prompt_template = """You are an expert roof inspector. Given the bounding boxes below,
classify each area and assign a severity.

Task: {task}
Bounding boxes:
{boxes}

Return ONLY JSON:
{{
  \"classifications\": [
    {{
      \"bbox\": [x1, y1, x2, y2],
      \"damage_type\": \"missing_shingles|cracks|hail_impact|water_stains|unknown\",
      \"severity\": \"minor|moderate|severe\"
    }}
  ]
}}
"""

    updated = {tuple(area["bbox"]): area for area in damage_areas if "bbox" in area}

    for chunk in _chunk_damage_areas(damage_areas):
        boxes_json = json.dumps([area["bbox"] for area in chunk])
        prompt = prompt_template.format(task=task, boxes=boxes_json)
        result, provider = ai_client.detect_content(image_bytes, prompt)
        if not result or "classifications" not in result:
            continue

        for entry in result["classifications"]:
            bbox_key = tuple(entry.get("bbox", []))
            if bbox_key in updated:
                updated_area = updated[bbox_key]
                updated_area["damage_type"] = entry.get("damage_type", updated_area.get("damage_type", "unknown"))
                updated_area["severity"] = entry.get("severity", updated_area.get("severity", "moderate"))
                updated_area["ai_provider"] = provider

    return list(updated.values())


def classify_damage_types(image_bytes: bytes, damage_areas: List[Dict[str, Any]], ai_client: Optional[Any] = None) -> List[Dict[str, Any]]:
    """
    Use AI to classify damage types in detected areas
    
    Args:
        image_bytes: Original image bytes
        damage_areas: List of damage areas with bbox
        ai_client: AIClient instance
        
    Returns:
        List of damage areas with added damage_type and severity
    """
    if not ai_client or not damage_areas:
        # Fallback: assign generic damage type
        for area in damage_areas:
            area.setdefault("damage_type", "unknown")
            area.setdefault("severity", "moderate")
        return damage_areas
    
    prompt = f"""Analyze these damage areas in this roof image and classify each one.

Damage areas (bounding boxes):
{json.dumps([{"bbox": area["bbox"]} for area in damage_areas], indent=2)}

For each damage area, classify:
- damage_type: one of "missing_shingles", "cracks", "hail_impact", "sagging", "unknown"
- severity: "minor", "moderate", or "severe"

Return ONLY valid JSON:
{{
  "classifications": [
    {{
      "bbox": [x1, y1, x2, y2],
      "damage_type": "missing_shingles",
      "severity": "moderate"
    }}
  ]
}}"""
    
    try:
        result, _ = ai_client.detect_content(image_bytes, prompt)
        if result and "classifications" in result:
            classifications = {tuple(c["bbox"]): c for c in result["classifications"]}
            for area in damage_areas:
                bbox_key = tuple(area["bbox"])
                if bbox_key in classifications:
                    area["damage_type"] = classifications[bbox_key].get("damage_type", "unknown")
                    area["severity"] = classifications[bbox_key].get("severity", "moderate")
                else:
                    area.setdefault("damage_type", "unknown")
                    area.setdefault("severity", "moderate")
    except Exception as e:
        print(f"Error in damage classification: {e}")
        # Fallback
        for area in damage_areas:
            area.setdefault("damage_type", "unknown")
            area.setdefault("severity", "moderate")
    
    return damage_areas


def enhance_colors(image_bytes: bytes) -> bytes:
    """
    Enhance image colors using histogram equalization and CLAHE
    
    Args:
        image_bytes: Original image bytes
        
    Returns:
        Enhanced image bytes
    """
    _ensure_cv2_available()
    _ensure_numpy_available()
    # Convert to numpy array
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Could not decode image")
    
    # Convert BGR to LAB
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    
    # Apply CLAHE to L channel
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l_enhanced = clahe.apply(l)
    
    # Merge channels
    lab_enhanced = cv2.merge([l_enhanced, a, b])
    
    # Convert back to BGR
    enhanced = cv2.cvtColor(lab_enhanced, cv2.COLOR_LAB2BGR)
    
    # Convert back to bytes
    _, buffer = cv2.imencode('.jpg', enhanced)
    return buffer.tobytes()


def convert_to_lab_colorspace(image_bytes: bytes) -> Any:
    """
    Convert RGB image to LAB color space
    
    Args:
        image_bytes: Image bytes
        
    Returns:
        LAB color space image as numpy array
    """
    _ensure_cv2_available()
    _ensure_numpy_available()
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Could not decode image")
    # Convert BGR to LAB
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
    return lab


def detect_discoloration(enhanced_image_bytes: bytes, ai_client: Optional[Any] = None) -> List[Dict[str, Any]]:
    """
    Detect discoloration areas using AI-assisted analysis
    
    Args:
        enhanced_image_bytes: Color-enhanced image bytes
        ai_client: AIClient instance
        
    Returns:
        List of discoloration areas with bbox, confidence, and discoloration_severity
    """
    if not ai_client:
        return []
    
    prompt = """Analyze this enhanced roof image and identify discoloration patterns that indicate damage.

Look for:
- Water stains (dark patches, discoloration)
- Weathering (faded, discolored areas)
- Algae growth (green/black discoloration)
- Material degradation (color changes)

For each discoloration area, provide:
- bbox: [x1, y1, x2, y2]
- confidence: 0.0-1.0
- discoloration_severity: 0.0-1.0
- damage_type: "water_stains", "weathering", "algae", "material_degradation"

Return ONLY valid JSON:
{
  "discolorations": [
    {
      "bbox": [x1, y1, x2, y2],
      "confidence": 0.85,
      "discoloration_severity": 0.75,
      "damage_type": "water_stains"
    }
  ]
}"""
    
    try:
        result, _ = ai_client.detect_content(enhanced_image_bytes, prompt)
        if result and "discolorations" in result:
            return result["discolorations"]
    except Exception as e:
        print(f"Error in discoloration detection: {e}")
    
    return []


def calculate_overlap(bbox1: List[int], bbox2: List[int]) -> float:
    """
    Calculate Intersection over Union (IoU) for two bounding boxes
    
    Args:
        bbox1: [x1, y1, x2, y2]
        bbox2: [x1, y1, x2, y2]
        
    Returns:
        IoU score (0.0-1.0)
    """
    x1_1, y1_1, x2_1, y2_1 = bbox1
    x1_2, y1_2, x2_2, y2_2 = bbox2
    
    # Calculate intersection
    x1_i = max(x1_1, x1_2)
    y1_i = max(y1_1, y1_2)
    x2_i = min(x2_1, x2_2)
    y2_i = min(y2_1, y2_2)
    
    if x2_i <= x1_i or y2_i <= y1_i:
        return 0.0
    
    intersection = (x2_i - x1_i) * (y2_i - y1_i)
    
    # Calculate union
    area1 = (x2_1 - x1_1) * (y2_1 - y1_1)
    area2 = (x2_2 - x1_2) * (y2_2 - y1_2)
    union = area1 + area2 - intersection
    
    if union == 0:
        return 0.0
    
    return intersection / union


def merge_damage_areas(primary: List[Dict[str, Any]],
                       secondary: List[Dict[str, Any]],
                       iou_threshold: float = 0.4) -> List[Dict[str, Any]]:
    """
    Merge two lists of damage areas, preferring higher-confidence entries when overlapping.
    """
    merged: List[Dict[str, Any]] = [dict(area) for area in primary]

    for candidate in secondary:
        bbox = candidate.get("bbox")
        if not bbox or len(bbox) != 4:
            continue

        best_match = None
        best_iou = 0.0
        for existing in merged:
            existing_bbox = existing.get("bbox", [])
            if len(existing_bbox) != 4:
                continue
            iou = calculate_overlap(existing_bbox, bbox)
            if iou > best_iou:
                best_iou = iou
                best_match = existing

        if best_match and best_iou >= iou_threshold:
            if candidate.get("confidence", 0) > best_match.get("confidence", 0):
                best_match.update(candidate)
        else:
            merged.append(candidate)

    return merged


def filter_large_damage_areas(damage_areas: List[Dict[str, Any]],
                              image_width: int,
                              image_height: int,
                              max_fraction: float = 0.45) -> List[Dict[str, Any]]:
    """
    Remove detections that cover an excessive portion of the frame (likely false positives).

    If filtering would remove all detections, fall back to the original list.
    """
    if image_width <= 0 or image_height <= 0:
        return damage_areas

    image_area = image_width * image_height
    filtered: List[Dict[str, Any]] = []

    for area in damage_areas:
        bbox = area.get("bbox")
        if not bbox or len(bbox) != 4:
            continue
        x1, y1, x2, y2 = bbox
        area_w = max(0, x2 - x1)
        area_h = max(0, y2 - y1)
        bbox_area = area_w * area_h
        fraction = bbox_area / float(image_area) if image_area else 0.0

        if len(damage_areas) > 1 and fraction > max_fraction:
            continue
        filtered.append(area)

    return filtered if filtered else damage_areas


def count_damage_instances(damage_areas: List[Dict[str, Any]]) -> Dict[str, int]:
    """
    Count damage instances by type
    
    Args:
        damage_areas: List of damage areas with damage_type
        
    Returns:
        Dictionary mapping damage_type to count
    """
    counts = {}
    for area in damage_areas:
        damage_type = area.get("damage_type", "unknown")
        counts[damage_type] = counts.get(damage_type, 0) + 1
    return counts


def generate_overlay(
    original_image_bytes: bytes,
    damage_areas: List[Dict[str, Any]],
    confidences: Optional[List[float]] = None,
    damage_types: Optional[List[str]] = None,
    counts: Optional[Dict[str, int]] = None
) -> bytes:
    """
    Generate overlay image with damage areas highlighted
    
    Args:
        original_image_bytes: Original image bytes
        damage_areas: List of damage areas with bbox
        confidences: Optional list of confidence scores
        damage_types: Optional list of damage types
        counts: Optional dictionary of damage counts by type
        
    Returns:
        Overlay image bytes (PNG with transparency)
    """
    # Load original image (used for positioning only)
    img = Image.open(io.BytesIO(original_image_bytes)).convert("RGBA")
    
    # Create transparent overlay layer (no base image)
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    
    # Color mapping for damage types
    damage_colors = {
        "missing_shingles": (255, 0, 0, 128),      # Red
        "cracks": (255, 165, 0, 128),               # Orange
        "hail_impact": (255, 255, 0, 128),         # Yellow
        "water_stains": (0, 0, 255, 128),          # Blue
        "sagging": (128, 0, 128, 128),            # Purple
        "discoloration": (0, 255, 255, 128),      # Cyan
        "unknown": (128, 128, 128, 128)           # Gray
    }
    
    # Draw damage areas
    for i, area in enumerate(damage_areas):
        bbox = area.get("bbox", [])
        if len(bbox) != 4:
            continue
        
        x1, y1, x2, y2 = bbox
        damage_type = damage_types[i] if damage_types and i < len(damage_types) else area.get("damage_type", "unknown")
        confidence = confidences[i] if confidences and i < len(confidences) else area.get("confidence", 0.5)
        
        # Get color for damage type
        color = damage_colors.get(damage_type, damage_colors["unknown"])
        # Adjust alpha based on confidence
        color = (*color[:3], int(color[3] * confidence))
        
        # Draw rectangle
        draw.rectangle([x1, y1, x2, y2], fill=color, outline=(*color[:3], 255), width=2)
        
        # Add label
        label = f"{damage_type}\n{confidence:.2f}"
        try:
            font = ImageFont.truetype("arial.ttf", 12)
        except:
            font = ImageFont.load_default()
        
        # Draw text background
        text_bbox = draw.textbbox((x1, y1), label, font=font)
        draw.rectangle(text_bbox, fill=(0, 0, 0, 200))
        draw.text((x1, y1), label, fill=(255, 255, 255, 255), font=font)
    
    # Use overlay layer as the export target (no base image)
    result = overlay.copy()
    
    # Add damage counts legend if provided
    if counts:
        legend_img = Image.new("RGBA", (200, len(counts) * 25 + 20), (0, 0, 0, 200))
        legend_draw = ImageDraw.Draw(legend_img)
        try:
            font = ImageFont.truetype("arial.ttf", 12)
        except:
            font = ImageFont.load_default()
        
        y_offset = 10
        legend_draw.text((10, y_offset), "Damage Counts:", fill=(255, 255, 255, 255), font=font)
        y_offset += 15
        
        for damage_type, count in counts.items():
            color = damage_colors.get(damage_type, damage_colors["unknown"])
            legend_draw.rectangle([10, y_offset, 25, y_offset + 15], fill=color)
            legend_draw.text((30, y_offset), f"{damage_type}: {count}", fill=(255, 255, 255, 255), font=font)
            y_offset += 20
        
        # Paste legend onto result
        result.paste(legend_img, (10, 10), legend_img)
    
    # Convert to bytes
    output = io.BytesIO()
    result.save(output, format="PNG")
    return output.getvalue()


