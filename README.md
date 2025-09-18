# EZ Kafka Visualizer

A modern, user-friendly web application for visualizing and managing Apache Kafka clusters. Built with Next.js, TypeScript, and Tailwind CSS.

## Features

- **Real-time Topic Management**: View, create, and delete Kafka topics
- **Cluster Information**: Monitor broker status and cluster health
- **Message Producer**: Send messages to Kafka topics with custom keys and headers
- **Modern UI**: Clean, responsive interface with dark mode support
- **TypeScript**: Full type safety throughout the application

## Prerequisites

- Node.js 18+ 
- npm, yarn, pnpm, or bun
- Apache Kafka cluster running locally on `localhost:9092` (KRaft mode supported)

## Quick Start

   - Consumer Groups: View consumer group membership and subscriptions
   ```

2. **Start your Kafka cluster:**
   Make sure your Kafka cluster is running on `localhost:9092`

3. **Run the development server:**
   ```bash
   npm run dev
│   │   ├── messages/      # Message sending endpoints
│   │   └── consumer-groups/ # Consumer groups listing

4. **Open your browser:**
   Navigate to [http://localhost:3700](http://localhost:3700)

│   ├── MessageConsumer.tsx    # Message consuming
│   ├── ConsumerGroups.tsx     # Consumer groups view

- `npm run dev` - Start development server on port 3700
- `npm run build` - Build the application for production
- `npm run start` - Start production server on port 3700
- `npm run lint` - Run ESLint

- `GET /api/consumer-groups` - List consumer groups

```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API routes for Kafka operations
│   │   ├── topics/        # Topic management endpoints
│   │   ├── messages/      # Message sending endpoints
│   │   └── cluster/       # Cluster information endpoints
│   ├── globals.css        # Global styles
│   ├── layout.tsx         # Root layout
│   └── page.tsx          # Main page
├── components/            # React components
│   ├── KafkaVisualizer.tsx    # Main dashboard component
│   ├── TopicList.tsx          # Topic management component
│   ├── ClusterInfo.tsx        # Cluster information component
│   └── MessageProducer.tsx    # Message sending component
└── lib/
    └── kafka.ts          # Kafka service and utilities
```

## API Endpoints

- `GET /api/topics` - List all topics
- `POST /api/topics` - Create a new topic
- `DELETE /api/topics/[name]` - Delete a topic
- `POST /api/messages` - Send a message to a topic
- `GET /api/cluster` - Get cluster information

## Technologies Used

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first CSS framework
- **KafkaJS** - Modern Apache Kafka client for Node.js
- **Lucide React** - Beautiful & consistent icons
- **Recharts** - Composable charting library

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.
