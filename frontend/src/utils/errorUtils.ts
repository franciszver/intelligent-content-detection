/**
 * Utility functions for safely extracting error messages
 */

/**
 * Safely extracts an error message from any error type.
 * Handles strings, Error objects, Step Functions error format, and other objects.
 */
export function extractErrorMessage(error: unknown): string {
  if (!error) return 'Unknown error';
  
  // Handle string errors
  if (typeof error === 'string') return error;
  
  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message;
    // Ensure message is a string (should always be, but be defensive)
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
    return error.name || 'Unknown error';
  }
  
  // Handle objects (including Step Functions error format: {Error: "...", Cause: "..."})
  if (typeof error === 'object' && error !== null) {
    const errObj = error as Record<string, unknown>;
    
    // Step Functions error format
    if (errObj.Error && typeof errObj.Error === 'string') {
      return errObj.Error;
    }
    if (errObj.Cause && typeof errObj.Cause === 'string') {
      return errObj.Cause;
    }
    
    // Standard error object with message property
    if (errObj.message) {
      const msg = errObj.message;
      if (typeof msg === 'string') return msg;
      if (typeof msg === 'object') {
        // Recursively extract if message is itself an object
        return extractErrorMessage(msg);
      }
    }
    
    // Fallback: try to stringify, but limit length
    try {
      const str = JSON.stringify(error);
      return str.length > 200 ? str.substring(0, 200) + '...' : str;
    } catch {
      return 'Unknown error (could not serialize)';
    }
  }
  
  // Fallback for other types
  try {
    return String(error);
  } catch {
    return 'Unknown error';
  }
}

