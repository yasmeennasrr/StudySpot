/// Answer to a noise sample (PB-19, POST /venues/{id}/noise-samples).
class NoiseSampleResult {
  const NoiseSampleResult({required this.recorded, this.level, required this.message});

  /// False when the analysis was unavailable: nothing was saved (AI-026).
  final bool recorded;

  /// quiet, moderate or noisy when [recorded].
  final String? level;
  final String message;

  factory NoiseSampleResult.fromJson(Map<String, dynamic> json) => NoiseSampleResult(
        recorded: json['status'] == 'recorded',
        level: json['level'] as String?,
        message: (json['message'] as String?) ?? '',
      );
}
