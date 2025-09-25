# EZ Kafka Visualizer

A modern, user-friendly web application for visualizing and managing Apache Kafka clusters. Built with Next.js, TypeScript, and Tailwind CSS with full multi-server support.

![Docker Pulls](https://img.shields.io/docker/pulls/chandanbhagat/ezkafka-visualizer)
![Docker Image Size](https://img.shields.io/docker/image-size/chandanbhagat/ezkafka-visualizer)
![GitHub](https://img.shields.io/github/license/thechandanbhagat/ezkafka-visualizer)

## ✨ Features

- **🌐 Multi-Server Support**: Connect to multiple Kafka clusters simultaneously
- **📊 Real-time Topic Management**: View, create, and delete Kafka topics
- **💻 Message Producer & Consumer**: Send and consume messages with custom keys and headers
- **👥 Consumer Groups**: Monitor consumer group membership and subscriptions
- **🔧 Cluster Information**: Monitor broker status and cluster health
- **🎨 Modern UI**: Clean, responsive interface with dark mode support
- **🐳 Docker Ready**: Pre-built Docker image with configurable ports
- **🔧 TypeScript**: Full type safety throughout the application

## 🚀 Quick Start

### Option 1: Docker (Recommended)

**Run with default settings:**
```bash
docker run -p 3700:3700 chandanbhagat/ezkafka-visualizer:latest
```

**Run with custom port:**
```bash
docker run -p 8080:8080 -e PORT=8080 chandanbhagat/ezkafka-visualizer:latest
```

**Connect to external Kafka:**
```bash
docker run -p 3700:3700 \
  -e KAFKA_BROKERS=your-kafka-server:9092 \
  chandanbhagat/ezkafka-visualizer:latest
```

### Option 2: Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/thechandanbhagat/ezkafka-visualizer.git
   cd ezkafka-visualizer
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to [http://localhost:3700](http://localhost:3700)

## 🐳 Docker Usage

### Pre-built Image

The application is available as a pre-built Docker image:

- **Latest**: `chandanbhagat/ezkafka-visualizer:latest`
- **Version 1.0**: `chandanbhagat/ezkafka-visualizer:v1.0`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3700` | Application port |
| `KAFKA_BROKERS` | `localhost:9092` | Kafka broker addresses |
| `KAFKA_CLIENT_ID` | `ezkafka-visualizer` | Kafka client identifier |
| `KAFKA_CONNECTION_TIMEOUT` | `3000` | Connection timeout (ms) |
| `KAFKA_REQUEST_TIMEOUT` | `30000` | Request timeout (ms) |

### Docker Compose

Use the included `docker-compose.yml` for a complete setup with Kafka:

```bash
# Copy environment template
cp .env.example .env

# Start services
docker-compose up
```

For detailed Docker instructions, see [DOCKER.md](DOCKER.md).

## 🛠️ Prerequisites

- **Docker**: For containerized deployment (recommended)
- **OR Node.js 18+**: For local development
- **Apache Kafka**: Running locally or remotely (KRaft mode supported)
## 📁 Project Structure

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes for Kafka operations
│   │   ├── topics/        # Topic management endpoints
│   │   ├── messages/      # Message sending endpoints
│   │   ├── consumer-groups/ # Consumer groups endpoints
│   │   └── settings/      # Settings endpoints
│   ├── producer/          # Producer page
│   ├── consumer/          # Consumer page
│   ├── topics/            # Topics page
│   ├── groups/            # Consumer groups page
│   ├── settings/          # Settings page
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout with ServerProvider
│   └── page.tsx          # Main dashboard
├── components/            # React components
│   ├── KafkaVisualizer.tsx    # Main dashboard with navbar
│   ├── TopicList.tsx          # Topic management component
│   ├── MessageProducer.tsx    # Message sending component
│   ├── MessageConsumer.tsx    # Message consuming component
│   ├── ConsumerGroups.tsx     # Consumer groups view
│   ├── KafkaSettings.tsx      # Multi-server settings
│   └── NavbarServerSelector.tsx # Server selection dropdown
├── contexts/              # React contexts
│   └── ServerContext.tsx  # Global server state management
├── lib/                   # Utilities
│   ├── kafka.ts          # Multi-server Kafka service
│   └── kafka-settings.ts # Server configuration management
└── types/
    └── globals.d.ts      # TypeScript declarations
```

## 🔧 Available Scripts

- `npm run dev` - Start development server on port 3700
- `npm run build` - Build the application for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `docker-compose up` - Start with Docker Compose

## 🌐 API Endpoints

### Topics
- `GET /api/topics?profileId=<id>` - List all topics
- `POST /api/topics` - Create a new topic
- `DELETE /api/topics/[name]?profileId=<id>` - Delete a topic
- `GET /api/topics/[name]/config?profileId=<id>` - Get topic configuration
- `GET /api/topics/[name]/partitions?profileId=<id>` - Get topic partitions

### Messages
- `POST /api/messages` - Send a message to a topic
- `POST /api/messages/consume` - Consume messages from a topic

### Consumer Groups
- `GET /api/consumer-groups?profileId=<id>` - List consumer groups

### Settings
- `GET /api/settings` - Get server configuration
- `POST /api/settings` - Update server configuration

## 🚀 Usage Examples

### Multi-Server Configuration
The application supports connecting to multiple Kafka clusters:

1. Click the server selector in the top navbar
2. Add new server profiles with different connection settings
3. Switch between servers to manage different clusters

### Message Production
```bash
# Send a simple message
curl -X POST http://localhost:3700/api/messages \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "my-topic",
    "message": "Hello Kafka!"
  }'
```

### Docker Deployment
```bash
# Production deployment
docker run -d \
  --name kafka-visualizer \
  -p 3700:3700 \
  -e KAFKA_BROKERS=kafka1:9092,kafka2:9092 \
  chandanbhagat/ezkafka-visualizer:latest
```

## 🛠️ Technologies Used

- **Next.js 15** - React framework with App Router and Turbopack
- **TypeScript** - Type-safe JavaScript with strict mode
- **Tailwind CSS** - Utility-first CSS framework with dark mode
- **KafkaJS** - Modern Apache Kafka client for Node.js
- **React Context** - Global state management for multi-server support
- **Lucide React** - Beautiful & consistent SVG icons
- **Docker** - Containerized deployment with Alpine Linux

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🔗 Links

- **Docker Hub**: [chandanbhagat/ezkafka-visualizer](https://hub.docker.com/r/chandanbhagat/ezkafka-visualizer)
- **GitHub**: [thechandanbhagat/ezkafka-visualizer](https://github.com/thechandanbhagat/ezkafka-visualizer)
- **Documentation**: [DOCKER.md](DOCKER.md) for detailed Docker usage

---

Made with ❤️ by [Chandan Bhagat](https://github.com/thechandanbhagat)
