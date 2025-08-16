"""Logging configuration for MCP server with daily rotating JSON logs."""

import logging
import logging.handlers
import json
import os
from datetime import datetime
from pathlib import Path


class JSONFormatter(logging.Formatter):
    """Custom formatter that outputs structured JSON logs."""
    
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "level": record.levelname,
            "session_id": getattr(record, 'session_id', None),
            "request_id": getattr(record, 'request_id', None),
            "tool_name": getattr(record, 'tool_name', None),
            "input_params": getattr(record, 'input_params', None),
            "output_data": getattr(record, 'output_data', None),
            "execution_time_ms": getattr(record, 'execution_time_ms', None),
            "success": getattr(record, 'success', None),
            "error": getattr(record, 'error', None),
            "message": record.getMessage()
        }
        
        # Remove None values to keep logs clean
        log_data = {k: v for k, v in log_data.items() if v is not None}
        
        return json.dumps(log_data, ensure_ascii=False)


def setup_mcp_logging():
    """Set up daily rotating JSON logging for MCP tools."""
    
    # Create logs directory
    log_dir = Path(__file__).parent.parent.parent / "logs"
    log_dir.mkdir(exist_ok=True)
    
    # Configure daily rotating file handler
    log_file = log_dir / "mcp_tools.log"
    handler = logging.handlers.TimedRotatingFileHandler(
        filename=str(log_file),
        when="midnight",
        interval=1,
        backupCount=30,  # Keep 30 days of logs
        encoding="utf-8",
        utc=True  # Use UTC for consistent timestamps
    )
    
    # Set filename suffix for rotated files (YYYY-MM-DD)
    handler.suffix = "%Y-%m-%d"
    
    # Use our custom JSON formatter
    handler.setFormatter(JSONFormatter())
    
    # Create and configure logger
    logger = logging.getLogger("mcp_tools")
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    
    # Prevent duplicate logs from propagating to root logger
    logger.propagate = False
    
    return logger


# Global logger instance
mcp_logger = setup_mcp_logging()