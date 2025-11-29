# Test Data

Synthetic roof samples used for validating the enhanced damage-detection pipeline. The images live in `test-data/roofs/` and are generated procedurally (no real customer data).

- **roof_sample_01.png** – three missing-shingle patches across the midline.
- **roof_sample_02.png** – four missing patches, varying widths.
- **roof_sample_03.png** – five patches, including edge cases near the roof boundary.

Ground-truth bounding boxes reside in `test-data/roofs/labels.json`, making it easy to compare AI output against expected detections in unit or integration tests.
