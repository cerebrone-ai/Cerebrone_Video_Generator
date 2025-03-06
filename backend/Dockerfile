# Use an official Python runtime as a parent image
FROM python:3.11-slim

# Set working directory in the container
WORKDIR /app

# Copy requirements first to leverage Docker cache
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application code
COPY . .

# Set environment variables
ENV FLASK_APP=main.py
ENV FLASK_DEBUG=0
ENV PORT=5002

# Expose the port the app runs on
EXPOSE 5002

# Command to run the application
CMD ["python", "main.py"]
