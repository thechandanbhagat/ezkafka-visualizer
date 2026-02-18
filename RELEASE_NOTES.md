# EZ Kafka Visualizer - Release Notes

## Version 1.0.0 - Initial Release
**Release Date:** February 16, 2026

We're excited to announce the initial release of **EZ Kafka Visualizer** - a modern, user-friendly web application for visualizing and managing Apache Kafka clusters!

### 🎉 Highlights

This first release brings a comprehensive Kafka management experience with:

- **Multi-Server Support** - Connect and manage multiple Kafka clusters from a single interface
- **Modern UI** - Clean, responsive design with full dark mode support
- **Real-time Operations** - Live topic management, message production, and consumption
- **Easy Deployment** - Available as NPM package, Docker image, or from source

### ✨ Key Features

#### Cluster Management
- Connect to multiple Kafka clusters simultaneously
- Switch between servers with an intuitive navbar selector
- Real-time cluster health and broker information
- Support for both traditional and KRaft mode Kafka installations

#### Topic Operations
- **View Topics**: Browse all topics with message counts and partition details
- **Create Topics**: Set up new topics with custom partition and replication settings
- **Delete Topics**: Remove topics with a single click
- **Configure Topics**: Edit topic configurations with helpful descriptions
- **Cleanup Messages**: Clear all messages from topics while preserving structure

#### Message Management
- **Producer Interface**: Send messages with custom keys, values, and headers
- **Consumer Interface**: Consume messages with configurable offset and partition settings
- **Real-time Updates**: See messages appear as they're consumed
- **JSON Support**: Automatic formatting and validation for JSON messages

#### Consumer Group Monitoring
- View all consumer groups in your cluster
- Monitor consumer group membership
- Track consumer subscriptions and assignments

#### User Experience
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile
- **Dark Mode**: Full dark mode support with system preference detection
- **Type Safety**: Complete TypeScript implementation for reliability
- **Modern Stack**: Built with Next.js 15, React 19, and Tailwind CSS 4

### 📦 Installation Options

#### Option 1: NPM Package (Recommended for Quick Start)
```bash
# Install globally
npm install -g ezkafka-visualizer

# Run with default settings
ezkafka-visualizer

# Run with custom port
ezkafka-visualizer --port 8080
```

#### Option 2: Docker (Recommended for Production)
```bash
# Pull and run
docker run -p 3700:3700 chandanbhagat/ezkafka-visualizer:latest

# With custom Kafka broker
docker run -p 3700:3700 \
  -e KAFKA_BROKERS=your-kafka:9092 \
  chandanbhagat/ezkafka-visualizer:latest
```

#### Option 3: From Source (For Development)
```bash
git clone https://github.com/thechandanbhagat/ezkafka-visualizer.git
cd ezkafka-visualizer
npm install
npm run dev
```

### 🐳 Docker Images

Available on Docker Hub:
- `chandanbhagat/ezkafka-visualizer:latest` - Latest stable release
- `chandanbhagat/ezkafka-visualizer:v1.0` - Version 1.0 tag

**Image Details:**
- Based on Alpine Linux for minimal size
- Supports custom port configuration
- Configurable Kafka connection settings
- Health checks included

### 🛠️ Technical Stack

- **Frontend**: Next.js 15 with App Router, React 19
- **Language**: TypeScript 5 with strict mode
- **Styling**: Tailwind CSS 4 with dark mode
- **Kafka Client**: KafkaJS 2.2.4
- **Icons**: Lucide React
- **Runtime**: Node.js 18+

### 📚 Documentation

This release includes comprehensive documentation:

- **README.md** - Quick start guide and feature overview
- **DOCKER.md** - Detailed Docker deployment instructions
- **KUBERNETES_DEPLOYMENT.md** - Kubernetes deployment guide
- **NPM_QUICK_START.md** - NPM package usage guide
- **NPM_PUBLISHING.md** - NPM publishing instructions
- **CHANGELOG.md** - Version history and changes

### 🔧 Configuration

The application can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3700` | Application port |
| `KAFKA_BROKERS` | `localhost:9092` | Kafka broker addresses |
| `KAFKA_CLIENT_ID` | `ezkafka-visualizer` | Kafka client identifier |
| `KAFKA_CONNECTION_TIMEOUT` | `3000` | Connection timeout (ms) |
| `KAFKA_REQUEST_TIMEOUT` | `30000` | Request timeout (ms) |

### 🚀 Getting Started

1. **Install the package:**
   ```bash
   npm install -g ezkafka-visualizer
   ```

2. **Start the visualizer:**
   ```bash
   ezkafka-visualizer
   ```

3. **Open your browser:**
   Navigate to [http://localhost:3700](http://localhost:3700)

4. **Configure your Kafka server:**
   - Click the settings icon in the navbar
   - Add your Kafka broker connection details
   - Start managing your Kafka cluster!

### 🌟 What's Next?

We're actively working on upcoming features:
- Schema Registry integration
- Enhanced message filtering and search
- Export data capabilities
- Custom dashboard views
- Performance metrics and monitoring
- SASL/SSL authentication support

### 📝 Known Issues

- None reported in this initial release

### 🤝 Contributing

We welcome contributions! Please see our GitHub repository for:
- Bug reports
- Feature requests
- Pull requests
- Documentation improvements

### 📞 Support & Links

- **GitHub**: [thechandanbhagat/ezkafka-visualizer](https://github.com/thechandanbhagat/ezkafka-visualizer)
- **Docker Hub**: [chandanbhagat/ezkafka-visualizer](https://hub.docker.com/r/chandanbhagat/ezkafka-visualizer)
- **NPM**: [ezkafka-visualizer](https://www.npmjs.com/package/ezkafka-visualizer)
- **Issues**: [GitHub Issues](https://github.com/thechandanbhagat/ezkafka-visualizer/issues)

### 📄 License

MIT License - See [LICENSE](LICENSE) file for details

---

**Happy Kafka Management! 🎊**

Built with ❤️ by [Chandan Bhagat](https://github.com/thechandanbhagat)
