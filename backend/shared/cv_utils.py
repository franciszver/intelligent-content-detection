"""
Computer vision utilities for image processing and analysis
"""
import base64
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


def segment_roof_zones(image_bytes: bytes, ai_client: Optional[Any] = None) -> List[Dict[str, Any]]:
    """
    Use AI to segment roof into zones (shingles, vents, skylights, gutters, edges)
    
    Args:
        image_bytes: Original image bytes
        ai_client: AIClient instance for AI vision API
        
    Returns:
        List of zones with zone_type, bbox, and confidence
    """
    if not ai_client:
        # Fallback: return entire image as shingle zone
        img = Image.open(io.BytesIO(image_bytes))
        return [{
            "zone_type": "shingles",
            "bbox": [0, 0, img.width, img.height],
            "confidence": 0.9
        }]
    
    prompt = """Segment this roof image into distinct zones. Identify and return bounding boxes for:
- shingles (main roof surface)
- vents (roof vents)
- skylights (if any)
- gutters (if visible)
- edges (roof edges)

Return ONLY valid JSON in this format:
{
  "zones": [
    {
      "zone_type": "shingles",
      "bbox": [x1, y1, x2, y2],
      "confidence": 0.95
    }
  ]
}"""
    
    try:
        result, _ = ai_client.detect_content(image_bytes, prompt)
        if result and "zones" in result:
            return result["zones"]
    except Exception as e:
        print(f"Error in zone segmentation: {e}")
    
    # Fallback
    img = Image.open(io.BytesIO(image_bytes))
    return [{
        "zone_type": "shingles",
        "bbox": [0, 0, img.width, img.height],
        "confidence": 0.9
    }]


def generate_wireframe(image_bytes: bytes, zones: Optional[List[Dict[str, Any]]] = None) -> bytes:
    """
    Generate wireframe from image using CV edge detection and line detection
    
    Args:
        image_bytes: Original image bytes
        zones: List of roof zones (optional, for focusing on shingle zones)
        
    Returns:
        Wireframe image bytes (PNG format)
    """
    _ensure_cv2_available()
    _ensure_numpy_available()
    # Convert image bytes to numpy array
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Could not decode image")
    
    # If zones provided, focus on shingle zones
    if zones:
        shingle_zones = [z for z in zones if z.get("zone_type") == "shingles"]
        if shingle_zones:
            # Create mask for shingle zones
            mask = np.zeros(img.shape[:2], dtype=np.uint8)
            for zone in shingle_zones:
                bbox = zone.get("bbox", [0, 0, img.shape[1], img.shape[0]])
                x1, y1, x2, y2 = bbox
                mask[y1:y2, x1:x2] = 255
            # Apply mask
            img = cv2.bitwise_and(img, img, mask=mask)
    
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Canny edge detection
    edges = cv2.Canny(blurred, 50, 150)
    
    # HoughLinesP for line detection
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, threshold=100, minLineLength=50, maxLineGap=10)
    
    # Create wireframe image (white background, black lines)
    wireframe = np.ones((img.shape[0], img.shape[1], 3), dtype=np.uint8) * 255
    
    if lines is not None:
        for line in lines:
            x1, y1, x2, y2 = line[0]
            cv2.line(wireframe, (x1, y1), (x2, y2), (0, 0, 0), 2)
    
    # Convert back to bytes
    _, buffer = cv2.imencode('.png', wireframe)
    return buffer.tobytes()


def detect_disjointed_lines(wireframe_bytes: bytes) -> List[Dict[str, Any]]:
    """
    Analyze wireframe for disjointed lines (damage indicators)
    
    Args:
        wireframe_bytes: Wireframe image bytes
        
    Returns:
        List of damage areas with bbox and confidence
    """
    _ensure_cv2_available()
    _ensure_numpy_available()
    # Convert wireframe to numpy array
    nparr = np.frombuffer(wireframe_bytes, np.uint8)
    wireframe = cv2.imdecode(nparr, cv2.IMREAD_GRAYSCALE)
    
    if wireframe is None:
        return []
    
    # Find contours (disjointed areas)
    contours, _ = cv2.findContours(wireframe, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    damage_areas = []
    for contour in contours:
        # Filter small contours (noise)
        area = cv2.contourArea(contour)
        if area < 100:  # Minimum area threshold
            continue
        
        # Get bounding box
        x, y, w, h = cv2.boundingRect(contour)
        
        # Calculate confidence based on area and shape
        # Larger, more irregular shapes indicate damage
        extent = area / (w * h) if w * h > 0 else 0
        confidence = min(0.9, 0.5 + (area / 10000) * 0.4)
        
        damage_areas.append({
            "bbox": [x, y, x + w, y + h],
            "confidence": float(confidence)
        })
    
    return damage_areas


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
    # Load original image
    img = Image.open(io.BytesIO(original_image_bytes)).convert("RGBA")
    
    # Create overlay layer
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
    
    # Composite overlay onto original
    result = Image.alpha_composite(img, overlay)
    
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


