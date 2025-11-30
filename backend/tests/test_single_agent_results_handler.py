import json
import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lambda', 'single-agent-results'))

from handler import handler  # type: ignore


class TestSingleAgentResultsHandler(unittest.TestCase):
    def setUp(self) -> None:
        os.environ['DYNAMODB_TABLE_NAME'] = 'test-table'
        os.environ['S3_BUCKET_NAME'] = 'test-bucket'
        os.environ['REGION'] = 'us-east-2'

    @patch('handler.generate_presigned_get_url')
    @patch('handler.get_metadata')
    def test_returns_single_agent_payload(self, mock_get_metadata, mock_presign) -> None:
        mock_metadata = SimpleNamespace(
            single_agent_results={'ai_summary': 'All good'},
            single_agent_overlay_s3_key='single-agent/overlays/test.png',
            single_agent_report_s3_key='single-agent/reports/test.json'
        )
        mock_get_metadata.return_value = mock_metadata
        mock_presign.return_value = 'https://signed-url'

        event = {'pathParameters': {'photoId': 'abc123'}}
        response = handler(event, None)

        self.assertEqual(response['statusCode'], 200)
        body = json.loads(response['body'])
        self.assertEqual(body['photo_id'], 'abc123')
        self.assertEqual(body['single_agent_results']['ai_summary'], 'All good')
        self.assertEqual(body['single_agent_overlay_url'], 'https://signed-url')
        self.assertEqual(body['single_agent_report_url'], 'https://signed-url')

    @patch('handler.get_metadata')
    def test_not_found_when_missing_results(self, mock_get_metadata) -> None:
        mock_get_metadata.return_value = None
        event = {'pathParameters': {'photoId': 'missing'}}
        response = handler(event, None)
        self.assertEqual(response['statusCode'], 404)


if __name__ == '__main__':
    unittest.main()

