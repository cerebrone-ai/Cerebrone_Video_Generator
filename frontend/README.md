# Bella Frontend

This is the frontend for the Bella project, built using [Next.js](https://nextjs.org).

## Prerequisites

Before you begin, ensure you have met the following requirements:
- You have installed [Node.js](https://nodejs.org/) (v18 or later)
- You have a running instance of the Bella backend
- You have created a `.env.local` file with the necessary environment variables (see `env.example` for reference)

## Installation

1. Clone the repository:
    ```bash
    git clone git-url
    cd bella-frontend
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

## Running the Development Server

To start the development server, run:
```bash
npm run dev
```

This will start the Next.js development server at `http://localhost:3000`.

## Building with Docker

To build the application with Docker, run:
```bash
docker build -t bella-frontend .
```

To run the application with Docker, run:
```bash
docker run -p 3000:3000 bella-frontend
```

This will start the application at `http://localhost:3000`.

#

