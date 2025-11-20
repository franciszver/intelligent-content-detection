"""
Prompt templates for AI content detection
"""
ROOF_DAMAGE_PROMPT = """Analyze this construction photo and identify roof damage.

Look for:
- Hail damage (circular dents, granule loss, bruising)
- Wind damage (missing shingles, lifted edges, creased shingles)
- Missing shingles (exposed underlayment, gaps in shingle coverage)

For each detection, provide:
- Type: "roof_damage"
- Category: "hail", "wind", or "missing_shingles"
- Bounding box: [x1, y1, x2, y2] in pixels (top-left and bottom-right coordinates)
- Confidence: 0.0-1.0
- Severity: "minor", "moderate", or "severe"

Return ONLY valid JSON in this exact format:
{
  "detections": [
    {
      "type": "roof_damage",
      "category": "hail",
      "confidence": 0.95,
      "bbox": [100, 200, 300, 400],
      "severity": "moderate"
    }
  ],
  "materials": []
}

If no damage is detected, return:
{
  "detections": [],
  "materials": []
}"""

MATERIAL_DETECTION_PROMPT = """Identify construction materials in this photo.

Look for:
- Shingles (count bundles, identify brand if visible on packaging)
- Plywood sheets (count individual sheets)
- Other materials (gravel, mulch - estimate volume if applicable)

For each material, provide:
- Type: material name (e.g., "shingles", "plywood", "gravel")
- Count: number of items/units
- Unit: "bundles", "sheets", "cubic_yards", etc.
- Brand: brand name if visible (e.g., "GAF", "Owens Corning")
- Confidence: 0.0-1.0

Return ONLY valid JSON in this exact format:
{
  "detections": [],
  "materials": [
    {
      "type": "shingles",
      "count": 25,
      "unit": "bundles",
      "brand": "GAF",
      "confidence": 0.88
    }
  ]
}

If no materials are detected, return:
{
  "detections": [],
  "materials": []
}"""

COMBINED_PROMPT = """Analyze this construction photo and identify both roof damage and construction materials.

ROOF DAMAGE:
Look for:
- Hail damage (circular dents, granule loss, bruising)
- Wind damage (missing shingles, lifted edges, creased shingles)
- Missing shingles (exposed underlayment, gaps in shingle coverage)

MATERIALS:
Look for:
- Shingles (count bundles, identify brand if visible)
- Plywood sheets (count individual sheets)
- Other materials (gravel, mulch - estimate volume)

Return ONLY valid JSON in this exact format:
{
  "detections": [
    {
      "type": "roof_damage",
      "category": "hail",
      "confidence": 0.95,
      "bbox": [100, 200, 300, 400],
      "severity": "moderate"
    }
  ],
  "materials": [
    {
      "type": "shingles",
      "count": 25,
      "unit": "bundles",
      "brand": "GAF",
      "confidence": 0.88
    }
  ]
}

If nothing is detected, return:
{
  "detections": [],
  "materials": []
}"""

