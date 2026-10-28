/// The one error type the app works with. Built from the backend's ErrorBody
/// ({ code, message, details, requestId }, contracts/openapi.yaml) or from a
/// network failure. [message] is always safe to show to the user (USE-008).
class ApiError implements Exception {
  const ApiError({
    required this.code,
    required this.message,
    this.statusCode,
    this.fieldErrors = const {},
  });

  /// One of the ErrorCode values (INVALID_INPUT, UNAUTHENTICATED, ...) or
  /// NETWORK / TIMEOUT for failures that never reached the backend.
  final String code;
  final String message;
  final int? statusCode;

  /// For INVALID_INPUT: field name -> what is wrong with it.
  final Map<String, String> fieldErrors;

  bool get isUnauthenticated => code == 'UNAUTHENTICATED' || statusCode == 401;
  bool get isNetworkProblem => code == 'NETWORK' || code == 'TIMEOUT';

  factory ApiError.fromBody(Object? body, int? statusCode) {
    if (body is Map) {
      final fields = <String, String>{};
      final details = body['details'];
      if (details is List) {
        for (final d in details) {
          if (d is Map && d['field'] is String) {
            final problems = d['problems'];
            fields[d['field'] as String] =
                problems is List ? problems.join('; ') : '$problems';
          }
        }
      }
      return ApiError(
        code: (body['code'] as String?) ?? 'INTERNAL',
        message: (body['message'] as String?) ??
            'Something went wrong. Please try again.',
        statusCode: statusCode,
        fieldErrors: fields,
      );
    }
    return ApiError(
      code: 'INTERNAL',
      message: 'Something went wrong. Please try again.',
      statusCode: statusCode,
    );
  }

  static const network = ApiError(
    code: 'NETWORK',
    message: 'No connection to StudySpot. Check your internet and try again.',
  );

  static const timeout = ApiError(
    code: 'TIMEOUT',
    message: 'The server is taking long to answer. It may be waking up, '
        'which can take up to a minute. Please try again.',
  );

  @override
  String toString() => 'ApiError($code, $statusCode): $message';
}
