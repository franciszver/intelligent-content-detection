"""
AI client for OpenAI and OpenRouter integration
"""
import os
import json
import base64
import time
from typing import Optional, Dict, Any, Tuple
import sys

# Add Lambda root directory to path (where shared module is located)
sys.path.insert(0, os.path.dirname(__file__))

from shared.secrets import get_openai_key, get_openrouter_key
from shared.cache import get_cache_key, get_cached_response, set_cached_response

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

import requests


class AIClient:
    """Client for AI inference with OpenAI and OpenRouter fallback"""
    
    def __init__(self):
        self.openai_key = get_openai_key()
        self.openrouter_key = get_openrouter_key()
        self.openai_client = None
        self.circuit_breaker_open = False
        self.circuit_breaker_failures = 0
        self.circuit_breaker_threshold = 3
        
        if self.openai_key and OpenAI:
            try:
                # Initialize OpenAI client with timeout
                self.openai_client = OpenAI(
                    api_key=self.openai_key,
                    timeout=30.0,  # 30 second timeout
                    max_retries=2
                )
            except Exception as e:
                print(f"Warning: Failed to initialize OpenAI client: {e}")
                print(f"Will use OpenRouter as fallback")
                self.openai_client = None
    
    def _encode_image(self, image_bytes: bytes) -> str:
        """Encode image bytes to base64"""
        return base64.b64encode(image_bytes).decode('utf-8')
    
    def _call_openai(self, image_bytes: bytes, prompt: str) -> Optional[Dict[str, Any]]:
        """Call OpenAI Vision API"""
        if not self.openai_client:
            return None
        
        try:
            start_time = time.time()
            base64_image = self._encode_image(image_bytes)
            print(f"Image encoding took {(time.time() - start_time) * 1000:.2f}ms")
            
            api_start = time.time()
            response = self.openai_client.chat.completions.create(
                model="gpt-4o",  # Updated from deprecated gpt-4-vision-preview
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                max_tokens=1000,
                temperature=0.1
            )
            print(f"OpenAI API call took {(time.time() - api_start) * 1000:.2f}ms")
            
            content = response.choices[0].message.content
            
            # Try to extract JSON from response
            # Sometimes the response includes markdown code blocks
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0].strip()
            elif '```' in content:
                content = content.split('```')[1].split('```')[0].strip()
            
            result = json.loads(content)
            self.circuit_breaker_failures = 0
            return result
            
        except json.JSONDecodeError as e:
            print(f"OpenAI JSON decode error: {e}")
            print(f"Response content: {content[:500]}")
            self.circuit_breaker_failures += 1
            return None
        except Exception as e:
            print(f"OpenAI API error: {e}")
            self.circuit_breaker_failures += 1
            if self.circuit_breaker_failures >= self.circuit_breaker_threshold:
                self.circuit_breaker_open = True
            return None
    
    def _call_openrouter(self, image_bytes: bytes, prompt: str) -> Optional[Dict[str, Any]]:
        """Call OpenRouter API as fallback"""
        if not self.openrouter_key:
            return None
        
        try:
            start_time = time.time()
            base64_image = self._encode_image(image_bytes)
            print(f"Image encoding took {(time.time() - start_time) * 1000:.2f}ms")
            
            headers = {
                "Authorization": f"Bearer {self.openrouter_key}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://github.com/intelligent-content-detection",
                "X-Title": "Intelligent Content Detection"
            }
            
            payload = {
                "model": "openai/gpt-4o",  # Updated from deprecated gpt-4-vision-preview
                "messages": [
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "text",
                                "text": prompt
                            },
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{base64_image}"
                                }
                            }
                        ]
                    }
                ],
                "max_tokens": 1000,
                "temperature": 0.1
            }
            
            api_start = time.time()
            response = requests.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers=headers,
                json=payload,
                timeout=30  # Reduced from 60 to 30 seconds
            )
            print(f"OpenRouter API call took {(time.time() - api_start) * 1000:.2f}ms")
            
            response.raise_for_status()
            data = response.json()
            
            content = data['choices'][0]['message']['content']
            
            # Try to extract JSON from response
            if '```json' in content:
                content = content.split('```json')[1].split('```')[0].strip()
            elif '```' in content:
                content = content.split('```')[1].split('```')[0].strip()
            
            result = json.loads(content)
            return result
            
        except json.JSONDecodeError as e:
            print(f"OpenRouter JSON decode error: {e}")
            print(f"Response content: {content[:500] if 'content' in locals() else 'N/A'}")
            return None
        except Exception as e:
            print(f"OpenRouter API error: {e}")
            return None
    
    def detect_content(self, image_bytes: bytes, prompt: str) -> Tuple[Optional[Dict[str, Any]], str]:
        """
        Detect content in image using AI
        
        Args:
            image_bytes: Image bytes
            prompt: Prompt for AI
            
        Returns:
            Tuple of (result_dict, provider_name) or (None, "error")
        """
        # Check cache first
        cache_key = get_cache_key(image_bytes, prompt)
        cached_result = get_cached_response(cache_key)
        if cached_result:
            return cached_result, "cache"
        
        # Try OpenAI first (unless circuit breaker is open)
        if not self.circuit_breaker_open:
            result = self._call_openai(image_bytes, prompt)
            if result:
                set_cached_response(cache_key, result)
                return result, "openai"
        
        # Fallback to OpenRouter
        result = self._call_openrouter(image_bytes, prompt)
        if result:
            set_cached_response(cache_key, result)
            return result, "openrouter"
        
        return None, "error"

