#!/usr/bin/env bash
set -euo pipefail

# @group Configuration : Resolve the project and version independently of the caller's directory
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
APP_PORT=${APP_PORT:-3700}
HOST_PORT=${HOST_PORT:-3700}
IMAGE_NAME=${IMAGE_NAME:-chandanbhagat/ezkafka-visualizer}
APP_VERSION=$(node -p "require('./package.json').version")
VCS_REF=$(git rev-parse HEAD 2>/dev/null || printf unknown)

# @group Validation : Reject invalid ports before passing them to Docker or printing run instructions
for port in "$APP_PORT" "$HOST_PORT"; do
    if [[ ! "$port" =~ ^[1-9][0-9]{0,4}$ ]] || (( 10#$port > 65535 )); then
        printf 'APP_PORT and HOST_PORT must be integers between 1 and 65535.\n' >&2
        exit 1
    fi
done
if [[ ! "$IMAGE_NAME" =~ ^[a-z0-9][a-z0-9._/:-]*$ ]]; then
    printf 'IMAGE_NAME must be a lowercase Docker repository name.\n' >&2
    exit 1
fi

# @group BusinessLogic > Build : Build the explicit package version without publishing it
printf 'Building %s:%s\n' "$IMAGE_NAME" "$APP_VERSION"
docker build --tag "$IMAGE_NAME:$APP_VERSION" \
    --build-arg "PORT=$APP_PORT" \
    --build-arg "APP_VERSION=$APP_VERSION" \
    --build-arg "VCS_REF=$VCS_REF" .

# @group Utilities > RunInstructions : Require authentication and persist cluster profiles
printf '\nImage built locally. Nothing was pushed.\n'
printf 'Copy .env.example to .env and configure EZKAFKA_ADMIN_USERNAME,\n'
printf 'EZKAFKA_ADMIN_PASSWORD (at least 16 characters), and EZKAFKA_PUBLIC_ORIGIN.\n'
printf 'Set KAFKA_BROKERS to an address reachable from inside the container.\n'
printf 'For the command below, the browser origin is http://localhost:%s.\n\n' "$HOST_PORT"
printf 'docker run --rm --name ezkafka-visualizer --env-file .env -p 127.0.0.1:%s:%s -e PORT=%s -v ezkafka-visualizer-data:/app/data %s:%s\n' \
    "$HOST_PORT" "$APP_PORT" "$APP_PORT" "$IMAGE_NAME" "$APP_VERSION"
printf '\nOr, after configuring .env, run the bundled Kafka stack: docker compose up --build\n'
