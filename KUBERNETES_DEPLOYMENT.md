# EZ Kafka Visualizer - Kubernetes Deployment

This document provides instructions for containerizing and deploying the EZ Kafka Visualizer application to a Kubernetes cluster.

## Prerequisites

- Docker installed and running
- Kubernetes cluster access (local or remote)
- kubectl configured to connect to your cluster
- NGINX Ingress Controller (if using Ingress)

## Quick Start

### Option 1: Using the deployment script (Linux/macOS)
```bash
chmod +x deploy.sh
./deploy.sh
```

### Option 2: Using the deployment script (Windows)
```cmd
deploy.bat
```

### Option 3: Manual deployment
See the [Manual Deployment](#manual-deployment) section below.

## Files Overview

### Docker Files
- `Dockerfile` - Multi-stage Docker build for the Next.js application
- `.dockerignore` - Files to exclude from Docker build context
- `next.config.ts` - Updated with standalone output for Docker

### Kubernetes Manifests (k8s/ directory)
- `namespace.yaml` - Creates the `ezkafka-visualizer` namespace
- `configmap.yaml` - Environment variables and configuration
- `deployment.yaml` - Application deployment with 2 replicas
- `service.yaml` - ClusterIP service to expose the application
- `ingress.yaml` - Ingress for external access (optional)
- `hpa.yaml` - Horizontal Pod Autoscaler for scaling (optional)
- `kafka-cluster.yaml` - Complete Kafka cluster deployment (optional)

## Configuration

### Environment Variables
Update the `configmap.yaml` file with your specific configuration:

```yaml
data:
  NODE_ENV: "production"
  PORT: "3700"
  HOSTNAME: "0.0.0.0"
  KAFKA_BROKERS: "kafka-service:9092"  # Update this for external Kafka
  KAFKA_CLIENT_ID: "ezkafka-visualizer"
```

### Kafka Connection
You have two options for Kafka:

1. **External Kafka**: Update `KAFKA_BROKERS` in configmap.yaml to point to your external Kafka cluster
2. **In-cluster Kafka**: Deploy the included Kafka cluster using `kafka-cluster.yaml`

## Manual Deployment

1. **Build the Docker image:**
   ```bash
   docker build -t ezkafka-visualizer:latest .
   ```

2. **Apply Kubernetes manifests:**
   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/configmap.yaml
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   ```

3. **Optional: Deploy Ingress for external access:**
   ```bash
   kubectl apply -f k8s/ingress.yaml
   ```

4. **Optional: Deploy HPA for auto-scaling:**
   ```bash
   kubectl apply -f k8s/hpa.yaml
   ```

5. **Optional: Deploy Kafka cluster:**
   ```bash
   kubectl apply -f k8s/kafka-cluster.yaml
   ```

## Accessing the Application

### Port Forward (Development)
```bash
kubectl port-forward service/ezkafka-visualizer-service 3700:3700 -n ezkafka-visualizer
```
Then visit: http://localhost:3700

### Ingress (Production)
If you deployed the Ingress:
1. Add `<your-cluster-ip> ezkafka.local` to your hosts file
2. Visit: http://ezkafka.local

### LoadBalancer Service
To use a LoadBalancer service instead of Ingress:
```bash
kubectl patch service ezkafka-visualizer-service -n ezkafka-visualizer -p '{"spec":{"type":"LoadBalancer"}}'
```

## Scaling

### Manual Scaling
```bash
kubectl scale deployment ezkafka-visualizer --replicas=5 -n ezkafka-visualizer
```

### Auto Scaling
The HPA will automatically scale between 2-10 replicas based on CPU (70%) and memory (80%) usage.

## Monitoring

### Check deployment status:
```bash
kubectl get pods -n ezkafka-visualizer
kubectl get services -n ezkafka-visualizer
kubectl get deployments -n ezkafka-visualizer
```

### View logs:
```bash
kubectl logs -f deployment/ezkafka-visualizer -n ezkafka-visualizer
```

### Describe resources:
```bash
kubectl describe deployment ezkafka-visualizer -n ezkafka-visualizer
kubectl describe service ezkafka-visualizer-service -n ezkafka-visualizer
```

## Resource Requirements

### Application Pod:
- **Requests**: 256Mi RAM, 250m CPU
- **Limits**: 512Mi RAM, 500m CPU

### Kafka Pod (if deployed):
- **Requests**: 1Gi RAM, 500m CPU
- **Limits**: 2Gi RAM, 1000m CPU
- **Storage**: 10Gi persistent volume

### Zookeeper Pod (if deployed):
- **Requests**: 512Mi RAM, 250m CPU
- **Limits**: 1Gi RAM, 500m CPU
- **Storage**: 5Gi persistent volume (data + logs)

## Security Considerations

1. **Network Policies**: Consider implementing network policies to restrict traffic
2. **RBAC**: Set up appropriate Role-Based Access Control
3. **Secrets**: Store sensitive data in Kubernetes secrets instead of ConfigMaps
4. **TLS**: Enable TLS for Ingress in production

## Troubleshooting

### Pod not starting:
```bash
kubectl describe pod <pod-name> -n ezkafka-visualizer
kubectl logs <pod-name> -n ezkafka-visualizer
```

### Service connectivity issues:
```bash
kubectl exec -it <pod-name> -n ezkafka-visualizer -- /bin/sh
# Test connectivity from inside the pod
```

### Kafka connection issues:
1. Verify Kafka service is running: `kubectl get pods -l app=kafka -n ezkafka-visualizer`
2. Check Kafka logs: `kubectl logs -l app=kafka -n ezkafka-visualizer`
3. Test connectivity: `kubectl exec -it <app-pod> -n ezkafka-visualizer -- nc -zv kafka-service 9092`

## Cleanup

To remove all resources:
```bash
kubectl delete namespace ezkafka-visualizer
```

Or remove individual components:
```bash
kubectl delete -f k8s/
```

## Production Considerations

1. **Use a container registry** for the Docker image
2. **Set up proper monitoring** with Prometheus/Grafana
3. **Implement backup strategies** for Kafka data (if running in-cluster)
4. **Configure resource quotas** for the namespace
5. **Set up alerting** for critical metrics
6. **Use multiple availability zones** for high availability
7. **Implement proper logging** with ELK stack or similar
8. **Regular security updates** for base images and dependencies
