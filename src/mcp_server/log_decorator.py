"""Decorator for automatically logging MCP tool calls."""

import time
import json
from functools import wraps
from typing import Any, Callable
from fastmcp import Context

from .logging_config import mcp_logger


def log_tool_calls(func: Callable) -> Callable:
    """
    Decorator that automatically logs MCP tool calls with input/output.
    
    The decorated function must accept a Context parameter for session tracking.
    """
    
    @wraps(func)
    def wrapper(*args, **kwargs):
        # Extract context from arguments
        ctx = None
        for arg in args:
            if isinstance(arg, Context):
                ctx = arg
                break
        
        if ctx is None:
            # Look for context in kwargs
            ctx = kwargs.get('ctx')
        
        # Start timing
        start_time = time.time()
        tool_name = func.__name__
        
        # Extract input parameters (exclude context from logging)
        input_params = {}
        
        # Get function signature to map args to parameter names
        import inspect
        sig = inspect.signature(func)
        param_names = list(sig.parameters.keys())
        
        # Map positional args to parameter names
        for i, arg in enumerate(args):
            if i < len(param_names) and not isinstance(arg, Context):
                input_params[param_names[i]] = arg
        
        # Add keyword args (exclude context)
        for key, value in kwargs.items():
            if key != 'ctx' and not isinstance(value, Context):
                input_params[key] = value
        
        # Log tool start
        mcp_logger.info(
            f"Tool {tool_name} started",
            extra={
                "session_id": ctx.session_id if ctx else None,
                "request_id": ctx.request_id if ctx else None,
                "tool_name": tool_name,
                "input_params": input_params,
                "success": None  # Will be updated on completion
            }
        )
        
        try:
            # Execute the original function
            result = func(*args, **kwargs)
            
            # Calculate execution time
            execution_time_ms = int((time.time() - start_time) * 1000)
            
            # Prepare output data for logging (truncate if too large)
            output_data = result
            if isinstance(result, (dict, list)):
                # Convert to JSON string to check size
                result_json = json.dumps(result, default=str)
                if len(result_json) > 10000:  # Limit to 10KB
                    if isinstance(result, dict):
                        output_data = {"_truncated": True, "_size": len(result_json), **{k: v for k, v in list(result.items())[:5]}}
                    else:
                        output_data = {"_truncated": True, "_size": len(result_json), "_length": len(result)}
            
            # Log successful completion
            mcp_logger.info(
                f"Tool {tool_name} completed successfully",
                extra={
                    "session_id": ctx.session_id if ctx else None,
                    "request_id": ctx.request_id if ctx else None,
                    "tool_name": tool_name,
                    "input_params": input_params,
                    "output_data": output_data,
                    "execution_time_ms": execution_time_ms,
                    "success": True,
                    "error": None
                }
            )
            
            return result
            
        except Exception as e:
            # Calculate execution time
            execution_time_ms = int((time.time() - start_time) * 1000)
            
            # Log error
            mcp_logger.error(
                f"Tool {tool_name} failed with error: {str(e)}",
                extra={
                    "session_id": ctx.session_id if ctx else None,
                    "request_id": ctx.request_id if ctx else None,
                    "tool_name": tool_name,
                    "input_params": input_params,
                    "output_data": None,
                    "execution_time_ms": execution_time_ms,
                    "success": False,
                    "error": str(e)
                }
            )
            
            # Re-raise the exception
            raise
    
    return wrapper