export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message, details) {
  return new ApiError(400, 'bad_request', message, details);
}

export function payloadTooLarge(message = 'Request body is too large') {
  return new ApiError(413, 'payload_too_large', message);
}

export function notFound(message = 'Resource not found') {
  return new ApiError(404, 'not_found', message);
}

export function bodyParserError(error) {
  if (error?.type === 'entity.parse.failed') {
    return badRequest('Malformed JSON body');
  }

  if (error?.type === 'entity.too.large') {
    return payloadTooLarge();
  }

  return null;
}

export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
