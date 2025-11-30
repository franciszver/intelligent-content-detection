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
    def test_handler_returns_single_agent_fields(self, mock_get_metadata, mock_presign):
        mock_metadata = MagicMock()
        mock_metadata.photo_id = "photo-123"
        mock_metadata.timestamp = "2024-01-01T00:00:00Z"
        mock_metadata.s3_key = "photos/user/photo-123.jpg"
        mock_metadata.status = "completed"
        mock_metadata.detections = []
        mock_metadata.materials = []
        mock_metadata.user_id = None
        mock_metadata.processing_time_ms = 450
        mock_metadata.ai_provider = "openai"
        mock_metadata.single_agent_results = {"ai_summary": "summary"}
        mock_metadata.single_agent_overlay_s3_key = "single-agent/overlay.png"
        mock_metadata.single_agent_report_s3_key = "single-agent/report.json"

        mock_get_metadata.return_value = mock_metadata
        mock_presign.side_effect = ["https://single-overlay", "https://single-report"]

        event = {"pathParameters": {"photoId": "photo-123"}}
        response = metadata_query_handler.handler(event, None)
        body = json.loads(response["body"])

        self.assertEqual(body["photo_id"], "photo-123")
        self.assertNotIn("workflow_status", body)
        self.assertEqual(body["single_agent_results"]["ai_summary"], "summary")
        self.assertEqual(body["single_agent_overlay_url"], "https://single-overlay")
        self.assertEqual(body["single_agent_report_url"], "https://single-report")


if __name__ == "__main__":
    unittest.main()

