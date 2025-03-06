import pytest
import sys
import os
from unittest.mock import Mock, patch, AsyncMock
import asyncio
import json
from datetime import datetime

# Add the parent directory to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from main import (
    VideoStyle,
    VideoGenerationRequest,
    ShotResult,
    generate_image,
    generate_video,
    generate_voiceover,
    image_to_video,
    generate_background_music,
    process_shots,
    app
)

# Mock data for testing
MOCK_TASK_ID = "06b2c585-e214-4d27-945b-56ff272732cc"
MOCK_LANGUAGE = "hindi"
MOCK_STYLE = VideoStyle.REALISTIC

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

@pytest.fixture
def mock_shot_details():
    return {
        "timestamp": "00:00-00:05",
        "ai_prompt": "Test prompt",
        "voiceover_script": "Test script in Hindi",
        "captions": ["Caption 1", "Caption 2"],
        "mood": "energetic",
        "special_effects": ["fade", "zoom"]
    }

@pytest.fixture
def mock_video_request():
    return {
        "project_title": "Test Video",
        "project_description": "A test video project",
        "target_audience": "Testing team",
        "duration": 30,
        "category": "test",
        "language": "hindi",
        "style": VideoStyle.REALISTIC
    }

# Mock Supabase Response
@pytest.fixture
def mock_supabase_response():
    class MockSupabase:
        def table(self, _):
            return self
        
        def select(self, _):
            return self
            
        def insert(self, _):
            return self
            
        def update(self, _):
            return self
            
        def eq(self, _, __):
            return self
            
        def execute(self):
            return {"data": [{"task_id": MOCK_TASK_ID, "status": "COMPLETED", "progress": 100}]}
    
    return MockSupabase()

# Test API Endpoints
def test_generate_video_endpoint_success(client, mock_video_request, mock_supabase_response):
    """Test successful video generation request"""
    with patch('main.supabase', mock_supabase_response):
        response = client.post('/api/v1/generate-video', json=mock_video_request)
        assert response.status_code == 200
        data = json.loads(response.data)
        assert "task_id" in data
        assert data["status"] == "QUEUED"

def test_generate_video_endpoint_invalid_request(client):
    """Test video generation with invalid request"""
    invalid_request = {
        "project_title": "Test Video",
        # Missing required fields
    }
    response = client.post('/api/v1/generate-video', json=invalid_request)
    assert response.status_code == 400

def test_video_status_endpoint_success(client, mock_supabase_response):
    """Test successful video status check"""
    with patch('main.supabase', mock_supabase_response):
        response = client.get(f'/api/v1/video-status/{MOCK_TASK_ID}')
        assert response.status_code == 200

def test_video_status_endpoint_invalid_id(client, mock_supabase_response):
    """Test video status with invalid task ID"""
    class EmptyMockSupabase(mock_supabase_response.__class__):
        def execute(self):
            return {"data": []}
    
    with patch('main.supabase', EmptyMockSupabase()):
        response = client.get('/api/v1/video-status/invalid-id')
        assert response.status_code == 404

# Test Image Generation
@pytest.mark.asyncio
async def test_generate_image():
    """Test image generation with style"""
    mock_result = {"images": [{"url": "test-image-url"}]}
    
    result = await generate_image(
        MOCK_TASK_ID,
        "Test prompt",
        MOCK_STYLE
    )
    assert "url" in result

@pytest.mark.asyncio
async def test_generate_image_error():
    """Test image generation error handling"""
    with patch('fal_client.subscribe', AsyncMock(side_effect=Exception("API Error"))):
        with pytest.raises(Exception):
            await generate_image(
                MOCK_TASK_ID,
                "Test prompt",
                MOCK_STYLE
            )


# Test Background Music Generation
@pytest.mark.asyncio
async def test_generate_background_music():
    """Test background music generation"""
    mock_result = {"audio_file": {"url": "test-music-url"}}
    
    result = await generate_background_music(
        MOCK_TASK_ID,
        "Test music prompt"
    )
    assert "url" in result

# Test Shot Processing
@pytest.mark.asyncio
async def test_process_shots(mock_supabase_response):
    """Test parallel shot processing"""
    mock_shots = [Mock(
        timestamp="00:00-00:05",
        ai_prompt="Test prompt",
        voiceover_script="Test script",
        captions=["Caption"],
        mood="energetic",
        special_effects=["fade"]
    )]
    
    with patch('main.generate_video', AsyncMock(return_value=({"url": "test-video-url"}))), \
         patch('main.generate_voiceover', AsyncMock(return_value={"url": "test-audio-url"})), \
         patch('main.supabase', mock_supabase_response):
        
        results = await process_shots(
            MOCK_TASK_ID,
            mock_shots,
            MOCK_LANGUAGE,
            MOCK_STYLE
        )
        
        assert len(results) == 1
        assert results[0].video_url == "test-video-url"
        assert results[0].voiceover_url == "test-audio-url"


# Test Error Response Model
def test_error_response_model(client, mock_supabase_response):
    """Test error response model"""
    class EmptyMockSupabase(mock_supabase_response.__class__):
        def execute(self):
            return {"data": []}
    
    with patch('main.supabase', EmptyMockSupabase()):
        response = client.get('/api/v1/video-status/nonexistent')
        assert response.status_code == 404
        data = json.loads(response.data)
        assert "error" in data
        assert "status_code" in data

# Test Model Validation
def test_video_generation_request_validation():
    """Test request model validation"""
    # Valid request
    valid_request = VideoGenerationRequest(
        project_title="Test",
        project_description="Test description",
        target_audience="Testers",
        duration=30,
        category="test",
        language="hindi",
        style=VideoStyle.REALISTIC
    )
    assert valid_request.duration >= 5
    assert valid_request.duration <= 600
    
    # Invalid request should raise validation error
    with pytest.raises(ValueError):
        VideoGenerationRequest(
            project_title="Test",
            project_description="Test description",
            target_audience="Testers",
            duration=1,  # Too short
            category="test",
            language="hindi",
            style=VideoStyle.REALISTIC
        )

# Test Shot Result Model
def test_shot_result_model():
    """Test shot result model"""
    shot = ShotResult(
        timestamp="00:00-00:05",
        ai_prompt="Test prompt",
        video_url="test-video-url",
        voiceover_script="Test script",
        voiceover_url="test-audio-url",
        captions=["Caption 1"],
        order=0,
        mood="energetic",
        special_effects=["fade"],
        video_status="completed",
        audio_status="completed"
    )
    assert shot.video_status in ["completed", "regenerating", "failed"]
    assert shot.audio_status in ["completed", "regenerating", "failed"]

# Test Language Support
@pytest.mark.parametrize("language", [
    "english",
    "punjabi",
    "hindi",
    "telugu",
    "tamil"
])
@pytest.mark.asyncio
async def test_language_support(language):
    """Test generation with different languages"""
    with patch('asyncio.to_thread', AsyncMock(return_value="test-audio-url")):
        result = await generate_voiceover(
            MOCK_TASK_ID,
            "Test script",
            language
        )
        assert "url" in result 