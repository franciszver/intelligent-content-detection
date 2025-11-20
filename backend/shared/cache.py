"""
Simple in-memory cache for AI responses to reduce API calls
"""
import hashlib
from typing import Optional, Dict, Any
import time

# Simple in-memory cache with TTL
_cache: Dict[str, tuple[Dict[str, Any], float]] = {}
_cache_ttl = 3600  # 1 hour


def get_cache_key(image_bytes: bytes, prompt: str) -> str:
    """
    Generate cache key from image and prompt
    
    Args:
        image_bytes: Image bytes
        prompt: Prompt string
        
    Returns:
        Cache key (hash)
    """
    combined = image_bytes + prompt.encode('utf-8')
    return hashlib.sha256(combined).hexdigest()


def get_cached_response(cache_key: str) -> Optional[Dict[str, Any]]:
    """
    Get cached response if available and not expired
    
    Args:
        cache_key: Cache key
        
    Returns:
        Cached response or None
    """
    if cache_key in _cache:
        response, timestamp = _cache[cache_key]
        if time.time() - timestamp < _cache_ttl:
            return response
        else:
            # Expired, remove from cache
            del _cache[cache_key]
    return None


def set_cached_response(cache_key: str, response: Dict[str, Any]) -> None:
    """
    Cache a response
    
    Args:
        cache_key: Cache key
        response: Response to cache
    """
    _cache[cache_key] = (response, time.time())
    
    # Simple cleanup: if cache gets too large, remove oldest entries
    if len(_cache) > 1000:
        # Remove 20% of oldest entries
        sorted_items = sorted(_cache.items(), key=lambda x: x[1][1])
        for key, _ in sorted_items[:200]:
            del _cache[key]


def clear_cache() -> None:
    """Clear all cached responses"""
    _cache.clear()

