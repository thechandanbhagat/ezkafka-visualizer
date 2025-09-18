#!/bin/bash

# EZ Kafka Visualizer Kubernetes Deployment Script

set -e

echo "🚀 Deploying EZ Kafka Visualizer to Kubernetes..."

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if docker is available
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed or not in PATH"
    exit 1
fi

# Function to check if a namespace exists
namespace_exists() {
    kubectl get namespace "$1" >/dev/null 2>&1
}

# Function to apply Kubernetes manifests
apply_manifest() {
    echo "📦 Applying $1..."
    kubectl apply -f "$1"
}

# Build Docker image
echo "🐳 Building Docker image..."
docker build -t ezkafka-visualizer:latest .

# If using a registry, tag and push the image
# docker tag ezkafka-visualizer:latest your-registry/ezkafka-visualizer:latest
# docker push your-registry/ezkafka-visualizer:latest

# Create namespace if it doesn't exist
if ! namespace_exists "ezkafka-visualizer"; then
    echo "📝 Creating namespace..."
    apply_manifest "k8s/namespace.yaml"
else
    echo "✅ Namespace already exists"
fi

# Apply ConfigMap
apply_manifest "k8s/configmap.yaml"

# Apply Deployment
apply_manifest "k8s/deployment.yaml"

# Apply Service
apply_manifest "k8s/service.yaml"

# Apply Ingress (optional)
echo "🌐 Do you want to deploy the Ingress? (y/n)"
read -r deploy_ingress
if [[ $deploy_ingress =~ ^[Yy]$ ]]; then
    apply_manifest "k8s/ingress.yaml"
    echo "📝 Don't forget to update /etc/hosts with: <your-cluster-ip> ezkafka.local"
fi

# Apply HPA (optional)
echo "📈 Do you want to deploy the Horizontal Pod Autoscaler? (y/n)"
read -r deploy_hpa
if [[ $deploy_hpa =~ ^[Yy]$ ]]; then
    apply_manifest "k8s/hpa.yaml"
fi

# Deploy Kafka cluster (optional)
echo "☕ Do you want to deploy Kafka cluster in Kubernetes? (y/n)"
read -r deploy_kafka
if [[ $deploy_kafka =~ ^[Yy]$ ]]; then
    apply_manifest "k8s/kafka-cluster.yaml"
    echo "⏳ Waiting for Kafka to be ready... (this may take a few minutes)"
    kubectl wait --for=condition=ready pod -l app=kafka -n ezkafka-visualizer --timeout=300s
    kubectl wait --for=condition=ready pod -l app=zookeeper -n ezkafka-visualizer --timeout=300s
else
    echo "📝 Make sure to update the KAFKA_BROKERS in configmap.yaml to point to your external Kafka cluster"
fi

# Wait for deployment to be ready
echo "⏳ Waiting for deployment to be ready..."
kubectl wait --for=condition=available deployment/ezkafka-visualizer -n ezkafka-visualizer --timeout=300s

# Get service information
echo "✅ Deployment completed successfully!"
echo ""
echo "📊 Service Information:"
kubectl get services -n ezkafka-visualizer
echo ""
echo "🏃 Running Pods:"
kubectl get pods -n ezkafka-visualizer
echo ""

# Port forward instructions
echo "🔗 To access the application locally, run:"
echo "kubectl port-forward service/ezkafka-visualizer-service 3700:3700 -n ezkafka-visualizer"
echo ""
echo "Then visit: http://localhost:3700"
