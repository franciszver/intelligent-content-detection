"""
Unit tests for response parser
"""
import unittest
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'lambda', 'content-detection'))

from response_parser import ResponseParser


class TestResponseParser(unittest.TestCase):
    """Test cases for ResponseParser"""
    
    def setUp(self):
        """Set up test fixtures"""
        self.parser = ResponseParser()
    
    def test_parse_valid_response(self):
        """Test parsing valid response"""
        response = {
            'detections': [
                {
                    'type': 'roof_damage',
                    'category': 'hail',
                    'confidence': 0.95,
                    'bbox': [100, 200, 300, 400],
                    'severity': 'moderate'
                }
            ],
            'materials': [
                {
                    'type': 'shingles',
                    'count': 25,
                    'unit': 'bundles',
                    'brand': 'GAF',
                    'confidence': 0.88
                }
            ]
        }
        
        parsed = self.parser.parse_response(response)
        
        self.assertEqual(len(parsed['detections']), 1)
        self.assertEqual(len(parsed['materials']), 1)
        self.assertEqual(parsed['detections'][0]['category'], 'hail')
        self.assertEqual(parsed['materials'][0]['count'], 25)
    
    def test_validate_valid_response(self):
        """Test validation of valid response"""
        response = {
            'detections': [
                {
                    'type': 'roof_damage',
                    'category': 'hail',
                    'confidence': 0.95
                }
            ],
            'materials': []
        }
        
        self.assertTrue(self.parser.validate_response(response))
    
    def test_validate_invalid_response(self):
        """Test validation of invalid response"""
        # Missing required fields
        response = {
            'detections': [
                {
                    'type': 'roof_damage'
                    # Missing 'category'
                }
            ]
        }
        
        self.assertFalse(self.parser.validate_response(response))
    
    def test_parse_empty_response(self):
        """Test parsing empty response"""
        response = {
            'detections': [],
            'materials': []
        }
        
        parsed = self.parser.parse_response(response)
        
        self.assertEqual(len(parsed['detections']), 0)
        self.assertEqual(len(parsed['materials']), 0)
    
    def test_parse_malformed_detection(self):
        """Test parsing response with malformed detection"""
        response = {
            'detections': [
                {
                    'type': 'roof_damage',
                    # Missing 'category' - should be skipped
                },
                {
                    'type': 'roof_damage',
                    'category': 'hail',
                    'confidence': 0.95
                }
            ],
            'materials': []
        }
        
        parsed = self.parser.parse_response(response)
        
        # Should only include valid detection
        self.assertEqual(len(parsed['detections']), 1)


if __name__ == '__main__':
    unittest.main()

