@echo off
REM Docker build and run script for EZ Kafka Visualizer

echo 🔨 Building EZ Kafka Visualizer Docker Image...

REM Set default values if not provided
if "%APP_PORT%"=="" set APP_PORT=3700
if "%HOST_PORT%"=="" set HOST_PORT=3700

echo Building with PORT: %APP_PORT%

REM Build the Docker image
docker build -t ezkafka-visualizer:latest --build-arg PORT=%APP_PORT% .

if %errorlevel% neq 0 (
    echo ❌ Docker build failed
    exit /b 1
)

echo ✅ Docker image built successfully!
echo.
echo To run the container:
echo   docker run -p %HOST_PORT%:%APP_PORT% -e PORT=%APP_PORT% ezkafka-visualizer:latest
echo.
echo Or with custom Kafka settings:
echo   docker run -p %HOST_PORT%:%APP_PORT% -e PORT=%APP_PORT% -e KAFKA_BROKERS=your-server:9092 ezkafka-visualizer:latest
echo.
echo Or use Docker Compose:
echo   docker-compose up
echo.

pause