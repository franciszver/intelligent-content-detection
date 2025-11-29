import json
from pathlib import Path

from shared import cv_utils

ROOT = Path(__file__).resolve().parents[2]
ROOF_DIR = ROOT / 'test-data' / 'roofs'
LABELS = json.loads((ROOF_DIR / 'labels.json').read_text())


def _load_image(name: str) -> bytes:
    return (ROOF_DIR / name).read_bytes()


def test_detect_missing_shingles_cv_matches_labels():
    """Ensure CV detector finds boxes overlapping each labeled patch."""
    for filename, meta in LABELS.items():
        image_bytes = _load_image(filename)
        detections = cv_utils.detect_missing_shingles_cv(image_bytes, min_area=400)
        detected_bboxes = [det.get('bbox') for det in detections if det.get('bbox')]
        assert detected_bboxes, f"No detections for {filename}"

        for truth_bbox in meta['bboxes']:
            overlaps = [
                cv_utils.calculate_overlap(truth_bbox, det_bbox)
                for det_bbox in detected_bboxes
            ]
            assert any(iou > 0.05 for iou in overlaps), (
                f"Failed to find detection overlapping labeled patch {truth_bbox} in {filename}"
            )
