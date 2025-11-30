import { coerceRpcError } from '../../src/utils/rcp.error';

describe('coerceRpcError', () => {
  it('should handle error with statusCode', () => {
    const error = { statusCode: 400, message: 'Bad request' };
    const result = coerceRpcError(error);
    
    expect(result.status).toBe(400);
    expect(result.message).toBe('Bad request');
  });

  it('should handle error with status field', () => {
    const error = { status: 401, message: 'Unauthorized' };
    const result = coerceRpcError(error);
    
    expect(result.status).toBe(401);
    expect(result.message).toBe('Unauthorized');
  });

  it('should handle error with response object', () => {
    const error = { response: { statusCode: 404, message: 'Not found' } };
    const result = coerceRpcError(error);
    
    expect(result.status).toBe(404);
    expect(result.message).toBe('Not found');
  });

  it('should handle array message', () => {
    const error = { statusCode: 422, message: ['Field 1 error', 'Field 2 error'] };
    const result = coerceRpcError(error);
    
    expect(result.message).toBe('Field 1 error; Field 2 error');
  });

  it('should default to 500 for invalid status codes', () => {
    const error = { statusCode: 999, message: 'Invalid status' };
    const result = coerceRpcError(error);
    
    expect(result.status).toBe(500);
  });

  it('should handle JSON string in message', () => {
    const error = { message: '{"statusCode": 400, "message": "Parsed error"}' };
    const result = coerceRpcError(error);
    
    expect(result.status).toBe(400);
    expect(result.message).toBe('Parsed error');
  });

  it('should handle string errors', () => {
    const error = 'Simple error message';
    const result = coerceRpcError(error);
    
    expect(result.status).toBe(500);
    expect(result.message).toBe('Simple error message');
  });

  it('should include error field when present', () => {
    const error = { statusCode: 400, message: 'Bad request', error: 'ValidationError' };
    const result = coerceRpcError(error);
    
    expect(result.error).toBe('ValidationError');
  });
});