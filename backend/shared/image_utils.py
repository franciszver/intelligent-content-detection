"""
Image preprocessing utilities for optimization
"""
from typing import Tuple, Optional, Dict, List
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


def pixel_to_grid_coords(x: int, y: int, image_width: int, image_height: int, grid_size: int = 10) -> Dict[str, int]:
    """
    Convert pixel coordinates to grid coordinates
    
    Args:
        x: X pixel coordinate
        y: Y pixel coordinate
        image_width: Image width in pixels
        image_height: Image height in pixels
        grid_size: Number of grid divisions (default 10x10)
        
    Returns:
        Dictionary with 'row' and 'col' grid coordinates
    """
    col = int((x / image_width) * grid_size)
    row = int((y / image_height) * grid_size)
    return {"row": min(row, grid_size - 1), "col": min(col, grid_size - 1)}


def bbox_to_grid_coords(bbox: List[int], image_width: int, image_height: int, grid_size: int = 10) -> Dict[str, int]:
    """
    Convert bounding box center to grid coordinates
    
    Args:
        bbox: Bounding box [x1, y1, x2, y2]
        image_width: Image width in pixels
        image_height: Image height in pixels
        grid_size: Number of grid divisions
        
    Returns:
        Dictionary with 'row' and 'col' grid coordinates
    """
    if len(bbox) != 4:
        return {"row": 0, "col": 0}
    
    x1, y1, x2, y2 = bbox
    center_x = (x1 + x2) / 2
    center_y = (y1 + y2) / 2
    
    return pixel_to_grid_coords(int(center_x), int(center_y), image_width, image_height, grid_size)


def calculate_bbox_area(bbox: List[int]) -> int:
    """
    Calculate area of bounding box
    
    Args:
        bbox: Bounding box [x1, y1, x2, y2]
        
    Returns:
        Area in pixels
    """
    if len(bbox) != 4:
        return 0
    
    x1, y1, x2, y2 = bbox
    width = max(0, x2 - x1)
    height = max(0, y2 - y1)
    return width * height


def bbox_intersection(bbox1: List[int], bbox2: List[int]) -> Optional[List[int]]:
    """
    Calculate intersection of two bounding boxes
    
    Args:
        bbox1: First bounding box [x1, y1, x2, y2]
        bbox2: Second bounding box [x1, y1, x2, y2]
        
    Returns:
        Intersection bounding box [x1, y1, x2, y2] or None if no intersection
    """
    if len(bbox1) != 4 or len(bbox2) != 4:
        return None
    
    x1_1, y1_1, x2_1, y2_1 = bbox1
    x1_2, y1_2, x2_2, y2_2 = bbox2
    
    x1_i = max(x1_1, x1_2)
    y1_i = max(y1_1, y1_2)
    x2_i = min(x2_1, x2_2)
    y2_i = min(y2_1, y2_2)
    
    if x2_i <= x1_i or y2_i <= y1_i:
        return None
    
    return [x1_i, y1_i, x2_i, y2_i]

