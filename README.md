# Cerebrone_Video_Generator

A Flask-based application that uses LangChain, GPT-4, and Fal AI to generate complete videos with voiceovers.

## Features

- Generate complete video production plans including:
  - Deep research based video script generation
  - Detailed storyboards broken into scenes
  - Shot-by-shot details with AI prompts and voiceover scripts
- Asynchronous video and voiceover generation using Fal AI
- Structured output using Pydantic models
- Configurable video parameters (duration, target audience, etc.)
- Error handling and logging
- CORS support
- Health check endpoint

## Prerequisites

- Python 3.11+
- Fal AI account
- OpenAI API key
- Serper Dev Key

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
    ```
5. Create a '.env.local' file with your API Keys and configurations within frontend folder:
   ```bash
   
    NEXT_PUBLIC_API_URL=http://localhost:8000
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
   cd frontend
   npm i -f
   npm run build
   npm start
   ```


## Docker

1. Copy the required env variable in the project root dir:

   ```sh
   $ cp $PWD/backend/env.example $PWD/backend/.env.backend
   ```

   ```sh
   $ cp $PWD/frontend/env.example $PWD/frontend/.env.frontend
   ```

2. Run the docker using the docker compose. For installation please refer to the [link](https://docs.docker.com/compose/install/).

    ```sh
    docker-compose up --build
    ```




