# Changelog

All notable changes to EZ Kafka Visualizer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Changelog file to track version history

## [1.0.0] - 2026-02-16

### Added
- Initial release of EZ Kafka Visualizer
- Multi-server Kafka cluster support
- Real-time topic management (create, delete, configure)
- Message producer with custom keys and headers
- Message consumer with configurable options
- Consumer groups monitoring
- Topic message cleanup functionality
- Dark mode support
- Docker containerization
- NPM package distribution
- Global CLI installation support
- Modern responsive UI with Tailwind CSS
- TypeScript type safety throughout the application
- Real-time cluster information display
- Topic configuration editor with descriptions
- Partition management
- Message count display per topic
- Consumer group subscriptions tracking

### Features
- **Multi-Server Support**: Connect to multiple Kafka clusters simultaneously
- **Topic Management**: View, create, delete, and configure topics
- **Message Operations**: Send and consume messages with full control
- **Consumer Monitoring**: Track consumer groups and their subscriptions
- **Configuration**: Edit topic configurations with helpful tooltips
- **Cleanup**: Remove all messages from topics while preserving structure
- **Responsive Design**: Works on desktop, tablet, and mobile devices
- **Dark Mode**: Full dark mode support for comfortable viewing
- **Docker Ready**: Pre-built Docker images available
- **CLI Tool**: Install globally via npm and run anywhere

### Technical Stack
- Next.js 15 with App Router
- React 19
- TypeScript 5
- Tailwind CSS 4
- KafkaJS 2.2.4
- Lucide React icons
- Node.js 18+

---

## Version Format

- **MAJOR**: Breaking changes (e.g., 1.0.0 → 2.0.0)
- **MINOR**: New features, backward compatible (e.g., 1.0.0 → 1.1.0)
- **PATCH**: Bug fixes, backward compatible (e.g., 1.0.0 → 1.0.1)

## Types of Changes

- `Added` - New features
- `Changed` - Changes in existing functionality
- `Deprecated` - Soon-to-be removed features
- `Removed` - Removed features
- `Fixed` - Bug fixes
- `Security` - Security fixes

## Example Entry Template

```markdown
## [1.1.0] - 2026-03-15

### Added
- New feature description
- Another feature

### Changed
- Modified behavior description

### Fixed
- Bug fix description
- Another bug fix

### Security
- Security improvement description
```

---

[Unreleased]: https://github.com/thechandanbhagat/ezkafka-visualizer/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/thechandanbhagat/ezkafka-visualizer/releases/tag/v1.0.0
