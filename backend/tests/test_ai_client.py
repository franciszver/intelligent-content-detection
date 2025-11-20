"""
Unit tests for AI client
"""
import unittest
from unittest.mock import Mock, patch, MagicMock
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lambda', 'content-detection'))

from ai_client import AIClient


class TestAIClient(unittest.TestCase):
    """Test cases for AIClient"""
    
    def setUp(self):
        """Set up test fixtures"""
        with patch('ai_client.get_openai_key', return_value='test-openai-key'), \
             patch('ai_client.get_openrouter_key', return_value='test-openrouter-key'), \
             patch('ai_client.OpenAI'):
            self.client = AIClient()
    
    def test_encode_image(self):
        """Test image encoding"""
        image_bytes = b'test image data'
        encoded = self.client._encode_image(image_bytes)
        self.assertIsInstance(encoded, str)
        self.assertGreater(len(encoded), 0)
    
    @patch('ai_client.get_cached_response')
    @patch('ai_client.set_cached_response')
    def test_cache_hit(self, mock_set_cache, mock_get_cache):
        """Test cache hit scenario"""
        cached_result = {'detections': [], 'materials': []}
        mock_get_cache.return_value = cached_result
        
        result, provider = self.client.detect_content(b'test', 'test prompt')
        
        self.assertEqual(result, cached_result)
        self.assertEqual(provider, 'cache')
        mock_get_cache.assert_called_once()
        mock_set_cache.assert_not_called()
    
    def test_circuit_breaker(self):
        """Test circuit breaker functionality"""
        # Simulate failures
        self.client.circuit_breaker_failures = 3
        self.client.circuit_breaker_open = True
        
        # Should skip OpenAI and go to OpenRouter
        with patch.object(self.client, '_call_openrouter', return_value={'test': 'data'}):
            result, provider = self.client.detect_content(b'test', 'test prompt')
            self.assertEqual(provider, 'openrouter')


if __name__ == '__main__':
    unittest.main()

