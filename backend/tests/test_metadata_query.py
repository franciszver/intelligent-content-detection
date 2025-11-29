import json
import os
import pathlib
import importlib.util
import unittest
from unittest.mock import MagicMock, patch


def load_handler_module():
    """Dynamically load the metadata query handler module."""
    module_path = (
        pathlib.Path(__file__).resolve().parents[1]
        / "lambda"
        / "metadata-query"
        / "handler.py"
    )
    spec = importlib.util.spec_from_file_location("metadata_query_handler", module_path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


metadata_query_handler = load_handler_module()


class MetadataQueryHandlerTests(unittest.TestCase):
    def setUp(self):
        os.environ["DYNAMODB_TABLE_NAME"] = "photos"
        os.environ["REGION"] = "us-east-2"
        os.environ["S3_BUCKET_NAME"] = "test-bucket"

    def tearDown(self):
        os.environ.pop("DYNAMODB_TABLE_NAME", None)
        os.environ.pop("REGION", None)
        os.environ.pop("S3_BUCKET_NAME", None)

    @patch.object(metadata_query_handler, "generate_presigned_get_url")
    @patch.object(metadata_query_handler, "get_metadata")
    def test_handler_returns_multi_agent_fields(self, mock_get_metadata, mock_presign):
        mock_metadata = MagicMock()
        mock_metadata.photo_id = "photo-123"
        mock_metadata.timestamp = "2024-01-01T00:00:00Z"
        mock_metadata.s3_key = "photos/user/photo-123.jpg"
        mock_metadata.status = "completed"
        mock_metadata.workflow_status = "completed"
        mock_metadata.detections = []
        mock_metadata.materials = []
        mock_metadata.user_id = None
        mock_metadata.processing_time_ms = 450
        mock_metadata.ai_provider = "openai"
        mock_metadata.agent1_results = {"wireframe_base64": "AAA"}
        mock_metadata.agent2_results = {"enhanced_image_base64": "BBB"}
        mock_metadata.agent3_results = {"damage_counts": {"missing_shingles": 2}}
        mock_metadata.overlay_s3_key = "overlays/photo-123/overlay.png"
        mock_metadata.report_s3_key = "reports/photo-123/report.json"

        mock_get_metadata.return_value = mock_metadata
        mock_presign.side_effect = ["https://overlay-url", "https://report-url"]

        event = {"pathParameters": {"photoId": "photo-123"}}
        response = metadata_query_handler.handler(event, None)
        body = json.loads(response["body"])

        self.assertEqual(body["photo_id"], "photo-123")
        self.assertEqual(body["workflow_status"], "completed")
        self.assertIn("agent1_results", body)
        self.assertIn("agent2_results", body)
        self.assertIn("agent3_results", body)
        self.assertEqual(body["overlay_url"], "https://overlay-url")
        self.assertEqual(body["report_url"], "https://report-url")


if __name__ == "__main__":
    unittest.main()

