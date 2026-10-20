@echo off
setlocal

REM @group Configuration : Resolve the project and version independently of the caller's directory
pushd "%~dp0" || exit /b 1
if not defined APP_PORT set "APP_PORT=3700"
if not defined HOST_PORT set "HOST_PORT=3700"
if not defined IMAGE_NAME set "IMAGE_NAME=chandanbhagat/ezkafka-visualizer"
set "APP_VERSION="
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "APP_VERSION=%%v"
if not defined APP_VERSION goto failure
set "VCS_REF=unknown"
for /f "delims=" %%v in ('git rev-parse HEAD 2^>nul') do set "VCS_REF=%%v"

REM @group Validation : Validate environment values before expanding them in shell commands
node -e "const e=process.env; for(const k of ['APP_PORT','HOST_PORT']) if(!/^[1-9][0-9]{0,4}$/.test(e[k]) || Number(e[k])>65535) { console.error('APP_PORT and HOST_PORT must be integers between 1 and 65535.'); process.exit(1); } if(!/^[a-z0-9][a-z0-9._/:-]*$/.test(e.IMAGE_NAME)) { console.error('IMAGE_NAME must be a lowercase Docker repository name.'); process.exit(1); }"
if errorlevel 1 goto failure

REM @group BusinessLogic > Build : Build the explicit package version without publishing it
echo Building %IMAGE_NAME%:%APP_VERSION%
call docker build --tag "%IMAGE_NAME%:%APP_VERSION%" --build-arg "PORT=%APP_PORT%" --build-arg "APP_VERSION=%APP_VERSION%" --build-arg "VCS_REF=%VCS_REF%" .
if errorlevel 1 goto failure

REM @group Utilities > RunInstructions : Require authentication and persist cluster profiles
echo.
echo Image built locally. Nothing was pushed.
echo Copy .env.example to .env and configure EZKAFKA_ADMIN_USERNAME,
echo EZKAFKA_ADMIN_PASSWORD ^(at least 16 characters^), and EZKAFKA_PUBLIC_ORIGIN.
echo Set KAFKA_BROKERS to an address reachable from inside the container.
echo For the command below, the browser origin is http://localhost:%HOST_PORT%.
echo.
echo docker run --rm --name ezkafka-visualizer --env-file .env -p 127.0.0.1:%HOST_PORT%:%APP_PORT% -e PORT=%APP_PORT% -v ezkafka-visualizer-data:/app/data %IMAGE_NAME%:%APP_VERSION%
echo.
echo Or, after configuring .env, run the bundled Kafka stack: docker compose up --build
popd
exit /b 0

REM @group ErrorHandling : Preserve failure status for callers and CI
:failure
popd
exit /b 1
