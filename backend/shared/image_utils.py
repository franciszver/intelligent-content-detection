"""
Image preprocessing utilities for optimization
"""
from typing import Tuple, Optional
from PIL import Image
import io


def resize_image_if_needed(
    image_bytes: bytes,
    max_width: int = 2048,
    max_height: int = 2048,
    quality: int = 85
) -> Tuple[bytes, bool]:
    """
    Resize image if it exceeds maximum dimensions
    
    Args:
        image_bytes: Original image bytes
        max_width: Maximum width
        max_height: Maximum height
        quality: JPEG quality (1-100)
        
    Returns:
        Tuple of (resized_image_bytes, was_resized)
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        original_size = img.size
        
        # Check if resize is needed
        if img.size[0] <= max_width and img.size[1] <= max_height:
            return image_bytes, False
        
        # Calculate new size maintaining aspect ratio
        ratio = min(max_width / img.size[0], max_height / img.size[1])
        new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
        
        # Resize
        img = img.resize(new_size, Image.Resampling.LANCZOS)
        
        # Convert back to bytes
        output = io.BytesIO()
        if img.format == 'PNG':
            img.save(output, format='PNG', optimize=True)
        else:
            img.save(output, format='JPEG', quality=quality, optimize=True)
        
        return output.getvalue(), True
        
    except Exception as e:
        print(f"Error resizing image: {e}")
        return image_bytes, False


def validate_image(image_bytes: bytes) -> Tuple[bool, Optional[str]]:
    """
    Validate image format and size
    
    Args:
        image_bytes: Image bytes
        
    Returns:
        Tuple of (is_valid, error_message)
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        
        # Check format
        if img.format not in ['JPEG', 'PNG', 'JPG']:
            return False, f"Unsupported format: {img.format}"
        
        # Check size (max 10MB)
        if len(image_bytes) > 10 * 1024 * 1024:
            return False, "Image too large (max 10MB)"
        
        return True, None
        
    except Exception as e:
        return False, str(e)

