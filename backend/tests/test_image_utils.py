"""
Unit tests for image utilities
"""
import unittest
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from shared.image_utils import validate_image, resize_image_if_needed


class TestImageUtils(unittest.TestCase):
    """Test cases for image utilities"""
    
    def test_validate_valid_image(self):
        """Test validation of valid image"""
        # Create a simple test image
        from PIL import Image
        import io
        
        img = Image.new('RGB', (100, 100), color='red')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        is_valid, error = validate_image(img_bytes.getvalue())
        self.assertTrue(is_valid)
        self.assertIsNone(error)
    
    def test_validate_invalid_format(self):
        """Test validation of invalid image format"""
        invalid_bytes = b'not an image'
        
        is_valid, error = validate_image(invalid_bytes)
        self.assertFalse(is_valid)
        self.assertIsNotNone(error)
    
    def test_resize_large_image(self):
        """Test resizing large image"""
        from PIL import Image
        import io
        
        # Create large image
        img = Image.new('RGB', (4000, 4000), color='blue')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        
        resized, was_resized = resize_image_if_needed(
            img_bytes.getvalue(),
            max_width=2048,
            max_height=2048
        )
        
        self.assertTrue(was_resized)
        
        # Verify new size
        resized_img = Image.open(io.BytesIO(resized))
        self.assertLessEqual(resized_img.size[0], 2048)
        self.assertLessEqual(resized_img.size[1], 2048)
    
    def test_no_resize_small_image(self):
        """Test that small images are not resized"""
        from PIL import Image
        import io
        
        # Create small image
        img = Image.new('RGB', (500, 500), color='green')
        img_bytes = io.BytesIO()
        img.save(img_bytes, format='JPEG')
        img_bytes.seek(0)
        original_bytes = img_bytes.getvalue()
        
        resized, was_resized = resize_image_if_needed(
            original_bytes,
            max_width=2048,
            max_height=2048
        )
        
        self.assertFalse(was_resized)
        self.assertEqual(len(resized), len(original_bytes))


if __name__ == '__main__':
    unittest.main()

