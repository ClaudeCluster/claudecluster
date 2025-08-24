@echo off
:: ClaudeCluster Docker Development Management Script (Windows)
:: Usage: scripts\docker-dev.bat [command]

setlocal enabledelayedexpansion

:: Docker Compose project name
set COMPOSE_PROJECT_NAME=claudecluster

:: Functions
:print_usage
echo ClaudeCluster Docker Development Manager (Windows)
echo.
echo Usage: %~nx0 [command]
echo.
echo Commands:
echo   build      Build all Docker images
echo   up         Start all services
echo   down       Stop all services
echo   restart    Restart all services
echo   logs       Show logs for all services
echo   status     Show service status
echo   clean      Remove all containers, volumes, and images
echo   health     Check health of all services
echo   env-check  Check environment variables
echo   rebuild    Clean rebuild of all services
echo.
echo Examples:
echo   %~nx0 up                 # Start all services
echo   %~nx0 logs               # Show logs
goto :eof

:log_info
echo [INFO] %~1
goto :eof

:log_success
echo [SUCCESS] %~1
goto :eof

:log_warning
echo [WARNING] %~1
goto :eof

:log_error
echo [ERROR] %~1
goto :eof

:check_env
if not exist ".env" (
    call :log_error ".env file not found!"
    call :log_info "Copy .env.example to .env and fill in the required values:"
    call :log_info "copy .env.example .env"
    exit /b 1
)

findstr /C:"ANTHROPIC_API_KEY" .env | findstr /V "your_anthropic_api_key_here" >nul
if errorlevel 1 (
    call :log_warning "ANTHROPIC_API_KEY may not be set correctly in .env"
)

findstr /C:"CLAUDE_CLI_SESSION_TOKEN" .env | findstr /V "your_claude_cli_session_token_here" >nul
if errorlevel 1 (
    call :log_warning "CLAUDE_CLI_SESSION_TOKEN may not be set correctly in .env"
    call :log_info "Get your session token by running: claude auth status"
)
goto :eof

:check_docker
docker --version >nul 2>&1
if errorlevel 1 (
    call :log_error "Docker is not installed or not in PATH"
    exit /b 1
)

docker compose version >nul 2>&1
if errorlevel 1 (
    call :log_error "Docker Compose is not available"
    exit /b 1
)

docker info >nul 2>&1
if errorlevel 1 (
    call :log_error "Docker daemon is not running"
    exit /b 1
)
goto :eof

:docker_build
call :log_info "Building ClaudeCluster Docker images..."
call :check_env
if errorlevel 1 exit /b 1
call :check_docker
if errorlevel 1 exit /b 1

docker compose -p %COMPOSE_PROJECT_NAME% build --pull
if errorlevel 1 (
    call :log_error "Build failed"
    exit /b 1
)
call :log_success "Build completed successfully"
goto :eof

:docker_up
call :log_info "Starting ClaudeCluster services..."
call :check_env
if errorlevel 1 exit /b 1
call :check_docker
if errorlevel 1 exit /b 1

docker compose -p %COMPOSE_PROJECT_NAME% up -d
if errorlevel 1 (
    call :log_error "Failed to start services"
    exit /b 1
)

call :log_info "Waiting for services to be ready..."
timeout /t 5 >nul

call :docker_status
call :log_success "Services started successfully"
call :log_info "MCP Server available at: http://localhost:3000"
call :log_info "Worker 1 available at: http://localhost:3001"  
call :log_info "Worker 2 available at: http://localhost:3002"
goto :eof

:docker_down
call :log_info "Stopping ClaudeCluster services..."
docker compose -p %COMPOSE_PROJECT_NAME% down
call :log_success "Services stopped successfully"
goto :eof

:docker_restart
call :log_info "Restarting ClaudeCluster services..."
call :docker_down
timeout /t 2 >nul
call :docker_up
goto :eof

:docker_logs
call :check_docker
if errorlevel 1 exit /b 1
docker compose -p %COMPOSE_PROJECT_NAME% logs
goto :eof

:docker_status
call :check_docker
if errorlevel 1 exit /b 1
call :log_info "ClaudeCluster service status:"
docker compose -p %COMPOSE_PROJECT_NAME% ps
goto :eof

:docker_clean
call :log_warning "This will remove ALL ClaudeCluster containers, volumes, and images!"
set /p confirm="Are you sure? (y/N): "
if /i "!confirm!" == "y" (
    call :log_info "Cleaning up ClaudeCluster resources..."
    
    docker compose -p %COMPOSE_PROJECT_NAME% down -v --remove-orphans
    
    :: Remove images (Windows command line version)
    for /f "tokens=3" %%i in ('docker images ^| findstr claudecluster') do (
        docker rmi -f %%i
    )
    
    :: Remove named volumes
    for /f "tokens=2" %%i in ('docker volume ls ^| findstr claudecluster') do (
        docker volume rm %%i
    )
    
    docker system prune -f
    
    call :log_success "Cleanup completed"
) else (
    call :log_info "Cleanup cancelled"
)
goto :eof

:docker_health
call :check_docker
if errorlevel 1 exit /b 1
call :log_info "Checking service health..."

echo.
echo === MCP Server Health ===
curl -s http://localhost:3000/health >nul 2>&1
if errorlevel 1 (
    call :log_error "MCP Server health check failed"
) else (
    call :log_success "MCP Server is healthy"
)

echo.
echo === Worker 1 Health ===
curl -s http://localhost:3001/hello >nul 2>&1
if errorlevel 1 (
    call :log_error "Worker 1 health check failed"
) else (
    call :log_success "Worker 1 is healthy"
)

echo.
echo === Worker 2 Health ===
curl -s http://localhost:3002/hello >nul 2>&1
if errorlevel 1 (
    call :log_error "Worker 2 health check failed"
) else (
    call :log_success "Worker 2 is healthy"
)
goto :eof

:docker_env_check
call :log_info "Checking environment configuration..."

if not exist ".env" (
    call :log_error ".env file not found"
    exit /b 1
)

echo.
echo === Environment File Status ===

findstr /C:"ANTHROPIC_API_KEY=" .env >nul
if errorlevel 1 (
    call :log_error "ANTHROPIC_API_KEY is missing from .env file"
) else (
    findstr /C:"ANTHROPIC_API_KEY" .env | findstr /V "your_anthropic_api_key_here" >nul
    if errorlevel 1 (
        call :log_error "ANTHROPIC_API_KEY is not properly configured"
    ) else (
        call :log_success "ANTHROPIC_API_KEY is set"
    )
)

findstr /C:"CLAUDE_CLI_SESSION_TOKEN=" .env >nul
if errorlevel 1 (
    call :log_error "CLAUDE_CLI_SESSION_TOKEN is missing from .env file"
) else (
    findstr /C:"CLAUDE_CLI_SESSION_TOKEN" .env | findstr /V "your_claude_cli_session_token_here" >nul
    if errorlevel 1 (
        call :log_error "CLAUDE_CLI_SESSION_TOKEN is not properly configured"
    ) else (
        call :log_success "CLAUDE_CLI_SESSION_TOKEN is set"
    )
)
goto :eof

:docker_rebuild
call :log_info "Performing clean rebuild of all services..."
call :docker_clean
call :docker_build
call :docker_up
goto :eof

:: Main script logic
if "%1" == "" goto help
if "%1" == "help" goto help
if "%1" == "--help" goto help
if "%1" == "-h" goto help

if "%1" == "build" call :docker_build
if "%1" == "up" call :docker_up
if "%1" == "down" call :docker_down
if "%1" == "restart" call :docker_restart
if "%1" == "logs" call :docker_logs
if "%1" == "status" call :docker_status
if "%1" == "clean" call :docker_clean
if "%1" == "health" call :docker_health
if "%1" == "env-check" call :docker_env_check
if "%1" == "rebuild" call :docker_rebuild
if "%1" == "build" goto :eof
if "%1" == "up" goto :eof
if "%1" == "down" goto :eof
if "%1" == "restart" goto :eof
if "%1" == "logs" goto :eof
if "%1" == "status" goto :eof
if "%1" == "clean" goto :eof
if "%1" == "health" goto :eof
if "%1" == "env-check" goto :eof
if "%1" == "rebuild" goto :eof

call :log_error "Unknown command: %1"
echo.

:help
call :print_usage