@echo off
REM EZ Kafka Visualizer Kubernetes Deployment Script for Windows

echo 🚀 Deploying EZ Kafka Visualizer to Kubernetes...

REM Check if kubectl is available
kubectl version --client >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ kubectl is not installed or not in PATH
    exit /b 1
)

REM Check if docker is available
docker --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker is not installed or not in PATH
    exit /b 1
)

REM Build Docker image
echo 🐳 Building Docker image...
docker build -t ezkafka-visualizer:latest .

REM If using a registry, tag and push the image
REM docker tag ezkafka-visualizer:latest your-registry/ezkafka-visualizer:latest
REM docker push your-registry/ezkafka-visualizer:latest

REM Create namespace
echo 📝 Creating namespace...
kubectl apply -f k8s/namespace.yaml

REM Apply ConfigMap
echo 📦 Applying ConfigMap...
kubectl apply -f k8s/configmap.yaml

REM Apply Deployment
echo 📦 Applying Deployment...
kubectl apply -f k8s/deployment.yaml

REM Apply Service
echo 📦 Applying Service...
kubectl apply -f k8s/service.yaml

REM Apply Ingress (optional)
echo 🌐 Do you want to deploy the Ingress? (y/n)
set /p deploy_ingress=
if /i "%deploy_ingress%"=="y" (
    kubectl apply -f k8s/ingress.yaml
    echo 📝 Don't forget to update hosts file with: ^<your-cluster-ip^> ezkafka.local
)

REM Apply HPA (optional)
echo 📈 Do you want to deploy the Horizontal Pod Autoscaler? (y/n)
set /p deploy_hpa=
if /i "%deploy_hpa%"=="y" (
    kubectl apply -f k8s/hpa.yaml
)

REM Deploy Kafka cluster (optional)
echo ☕ Do you want to deploy Kafka cluster in Kubernetes? (y/n)
set /p deploy_kafka=
if /i "%deploy_kafka%"=="y" (
    kubectl apply -f k8s/kafka-cluster.yaml
    echo ⏳ Waiting for Kafka to be ready... (this may take a few minutes)
    kubectl wait --for=condition=ready pod -l app=kafka -n ezkafka-visualizer --timeout=300s
    kubectl wait --for=condition=ready pod -l app=zookeeper -n ezkafka-visualizer --timeout=300s
) else (
    echo 📝 Make sure to update the KAFKA_BROKERS in configmap.yaml to point to your external Kafka cluster
)

REM Wait for deployment to be ready
echo ⏳ Waiting for deployment to be ready...
kubectl wait --for=condition=available deployment/ezkafka-visualizer -n ezkafka-visualizer --timeout=300s

REM Get service information
echo ✅ Deployment completed successfully!
echo.
echo 📊 Service Information:
kubectl get services -n ezkafka-visualizer
echo.
echo 🏃 Running Pods:
kubectl get pods -n ezkafka-visualizer
echo.

REM Port forward instructions
echo 🔗 To access the application locally, run:
echo kubectl port-forward service/ezkafka-visualizer-service 3700:3700 -n ezkafka-visualizer
echo.
echo Then visit: http://localhost:3700

pause
