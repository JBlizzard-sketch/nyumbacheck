FROM python:3.12-slim

WORKDIR /app

# Install system dependencies for Playwright and image processing
RUN apt-get update && apt-get install -y \
    gcc \
    libpq-dev \
    libjpeg-dev \
    libpng-dev \
    libwebp-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN playwright install chromium --with-deps

COPY . .

CMD ["uvicorn", "nyumbacheck.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
