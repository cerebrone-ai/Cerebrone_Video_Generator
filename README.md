# Cerebrone_Video_Generator

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
- Fal AI account
- FirstImpress account
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
    NARAKEET_API_KEY=<your_narakeet_api_key>
    IMAGE_GEN_API_KEY=<your_image_gen_api_key>
    ```

## Usage

1. Start the Flask server:
    ```bash
    cd backend
    python main.py
    ```
2. Start the frontend Application:

   ```bash
   npm i -f
   npm run build
   npm start
   ```


## Docker

1. Run the services using Docker Compose:
    ```bash
    docker-compose up --build
    ```




