import pytest
import os
from dotenv import load_dotenv

# Load environment variables for testing
load_dotenv()

# Configure test environment
def pytest_configure(config):
    """Configure test environment"""
    os.environ['TESTING'] = 'True'
    # Add any other test-specific environment variables here

@pytest.fixture(autouse=True)
def mock_env_vars(monkeypatch):
    """Mock environment variables for testing"""
    monkeypatch.setenv('SUPABASE_URL', 'https://test-supabase-url.com')
    monkeypatch.setenv('SUPABASE_KEY', 'test-key')
    monkeypatch.setenv('OPENAI_API_KEY', 'test-openai-key')

@pytest.fixture
def mock_supabase_response():
    """Mock Supabase response data"""
    return {
        "data": [{
            "task_id": "test-task-123",
            "status": "COMPLETED",
            "progress": 100,
            "shots": [],
            "created_at": "2024-01-01T00:00:00Z",
            "updated_at": "2024-01-01T00:00:00Z"
        }]
    }

@pytest.fixture
def mock_fal_response():
    """Mock Fal AI response data"""
    return {
        "images": [{
            "url": "https://test-image-url.com/image.jpg"
        }],
        "video": {
            "url": "https://test-video-url.com/video.mp4"
        },
        "audio_file": {
            "url": "https://test-audio-url.com/audio.mp3"
        }
    }

@pytest.fixture
def mock_text2speech():
    """Mock Text2Speech instance"""
    class MockText2Speech:
        def generate_speech(self, text, language):
            return "https://test-voice-url.com/voice.mp3"
    return MockText2Speech() 