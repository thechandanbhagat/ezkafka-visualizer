# Docker Usage Guide

This guide explains how to build and run the EZ Kafka Visualizer using Docker with configurable ports and settings.

## Quick Start

### 1. Build the Docker Image

**Windows:**
```bash
docker-build.bat
```

**Linux/Mac:**
```bash
chmod +x docker-build.sh
./docker-build.sh
```

**Manual Build:**
```bash
docker build -t ezkafka-visualizer:latest .
```

### 2. Run with Default Settings
```bash
docker run -p 3700:3700 ezkafka-visualizer:latest
```

### 3. Run with Custom Port
```bash
docker run -p 8080:8080 -e PORT=8080 ezkafka-visualizer:latest
```

## Configuration Options

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3700` | Application port inside container |
| `HOSTNAME` | `0.0.0.0` | Bind address |
| `KAFKA_BROKERS` | `localhost:9092` | Kafka broker addresses |
| `KAFKA_CLIENT_ID` | `ezkafka-visualizer` | Kafka client identifier |
| `KAFKA_CONNECTION_TIMEOUT` | `3000` | Connection timeout (ms) |
| `KAFKA_REQUEST_TIMEOUT` | `30000` | Request timeout (ms) |

### Build Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `PORT` | `3700` | Port to expose in Dockerfile |

## Usage Examples

### Run with External Kafka
```bash
docker run -p 3700:3700 \
  -e KAFKA_BROKERS=your-kafka-server:9092 \
  -e KAFKA_CLIENT_ID=my-visualizer \
  ezkafka-visualizer:latest
```

### Run on Custom Port
```bash
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e KAFKA_BROKERS=localhost:9092 \
  ezkafka-visualizer:latest
```

### Run with Multiple Kafka Brokers
```bash
docker run -p 3700:3700 \
  -e KAFKA_BROKERS=broker1:9092,broker2:9092,broker3:9092 \
  ezkafka-visualizer:latest
```

## Docker Compose

### Using Docker Compose with Kafka Included

1. **Copy environment template:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env` file:**
   ```env
   APP_PORT=3700
   HOST_PORT=3700
   KAFKA_BROKERS=kafka:9092
   ```

3. **Start services:**
   ```bash
   docker-compose up
   ```

### Using Docker Compose with External Kafka

1. **Edit `.env` file:**
   ```env
   APP_PORT=3700
   HOST_PORT=3700
   KAFKA_BROKERS=your-external-kafka:9092
   ```

2. **Start only the visualizer:**
   ```bash
   docker-compose up ezkafka-visualizer
   ```

## Custom Port Configuration

### Build with Custom Port
```bash
docker build -t ezkafka-visualizer:custom --build-arg PORT=8080 .
```

### Run with Port Mapping
```bash
# Map host port 8080 to container port 3700
docker run -p 8080:3700 ezkafka-visualizer:latest

# Run container on port 8080 and map to host port 8080
docker run -p 8080:8080 -e PORT=8080 ezkafka-visualizer:latest
```

## Development vs Production

### Development Mode
Use the regular Next.js dev server:
```bash
npm run dev
```

### Production Mode (Docker)
```bash
docker run -p 3700:3700 \
  -e NODE_ENV=production \
  -e KAFKA_BROKERS=your-kafka:9092 \
  ezkafka-visualizer:latest
```

## Troubleshooting

### Port Already in Use
```bash
# Check what's using the port
netstat -ano | findstr :3700

# Use a different host port
docker run -p 3800:3700 ezkafka-visualizer:latest
```

### Cannot Connect to Kafka
```bash
# Check if Kafka is accessible from container
docker run --rm -it ezkafka-visualizer:latest sh
# Inside container: telnet your-kafka-host 9092
```

### Container Logs
```bash
# View container logs
docker logs <container-id>

# Follow logs
docker logs -f <container-id>
```

## Advanced Configuration

### Custom Docker Compose Override
Create `docker-compose.override.yml`:
```yaml
version: '3.8'
services:
  ezkafka-visualizer:
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - KAFKA_BROKERS=my-kafka:9092
```

### Health Check
The container includes a basic health check. Check status:
```bash
docker inspect --format='{{.State.Health.Status}}' <container-id>
```