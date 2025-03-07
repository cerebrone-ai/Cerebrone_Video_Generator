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

4. Create a `.env` file with your API keys and configuration within backend folder:
    ```bash
    OPENAI_API_KEY=<your_openai_api_key>
    FAL_KEY=<your_fal_ai_key>
    NARAKEET_API_KEY=<your_narakeet_api_key>
    IMAGE_GEN_API_KEY=<your_image_gen_api_key>
    ```
5. Create a '.env.local' file with your API Keys and configurations within frontend folder:
   ```bash
    NEXT_PUBLIC_WEBSOCKET_URL=<your_api_key>
    NEXT_PUBLIC_API_URL=http://localhost:8000
    IMAGE_GEN_API=<your_api_key>
    IMAGE_GEN_API_KEY=<your_api_key>
    RESEND_API_KEY=<your_api_key>
    RESEND_AUDIENCE_LIST_ID=<your_api_key>
    RESEND_FROM_EMAIL=<your_api_key>
    FAL_KEY=<your_api_key>
    NEXT_PUBLIC_VIDEO_API_URL=http://localhost:5002/
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

1. Copy the required env variable

   - For the backend:

   ```sh
   $ cp $PWD/backend/env.example $PWD/backend/.env.backend
   ```
   - Add the `OPENAI_KEY`, `FAL_KEY` and `NARAKEET_API_KEY` in the `.env.backend` file.

   - For the frontend:

   ```sh
   $ cp $PWD/frontend/env.example $PWD/frontend/.env.frontend
   ```

2. Run the docker using the docker compose. For installation please refer to the [link](https://docs.docker.com/compose/install/).

    ```sh
    docker-compose up --build
    ```




