# AI Video Generator API

A Flask-based REST API that uses LangChain, GPT-4, and Fal AI to generate complete videos with voiceovers.

## Features

- Generate complete video production plans including:
  - Professional video scripts
  - Detailed storyboards broken into scenes
  - Shot-by-shot details with AI prompts and voiceover scripts
- Asynchronous video and voiceover generation using Fal AI
- Background task processing with Celery
- Progress tracking with Supabase
- Structured output using Pydantic models
- Configurable video parameters (duration, target audience, etc.)
- Error handling and logging
- CORS support
- Health check endpoint

## Prerequisites

- Python 3.11+
- Redis server
- Supabase account
- Fal AI account
- OpenAI API key

## Installation

1. Clone the repository
2. Create a virtual environment:
    ```bash
    python -m venv venv
    source venv/bin/activate # On Windows: venv\Scripts\activate
    ```
3. Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```

4. Create a `.env` file with your API keys and configuration:
    ```bash
    OPENAI_API_KEY=<your_openai_api_key>
    FAL_KEY=<your_fal_ai_key>
    SUPABASE_URL=<your_supabase_url>
    SUPABASE_KEY=<your_supabase_key>
    NARAKEET_API_KEY=<your_narakeet_api_key>

    SPACES_REGION=<your_spaces_region>
    SPACES_ENDPOINT=<your_spaces_endpoint>
    SPACES_KEY=<your_spaces_key>
    SPACES_SECRET=<your_spaces_secret>
    SPACES_BUCKET=<your_spaces_bucket>
    ```

## Usage

1. Start the Flask server:
    ```bash
    flask run
    ```

2. Make a POST request to start video generation:
    ```bash
    curl -X POST http://localhost:5001/api/v1/generate-video \
    -H "Content-Type: application/json" \
    -d '{
        "project_title": "My Video Project",
        "project_description": "A video about my project",
        "target_audience": "tech enthusiasts",
        "duration": 300,
        "category": "technology"
    }'
    ```

3. Get generation status:
    ```bash
    curl http://localhost:5001/api/v1/video-status/<task_id>
    ```

## Docker

1. Build the Docker image:
    ```bash
    docker build -t ai-video-generator .
    ```

2. Run the services using Docker Compose:
    ```bash
    docker-compose up
    ```


## Testing

To run the tests:

1. Install the dependencies:
    ```bash
    pip install -r tests/requirements-test.txt
    ```

2. Run the tests:
    ```bash
pytest
```