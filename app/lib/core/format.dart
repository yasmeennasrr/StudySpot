import 'models/venue.dart';

/// Display rules for venue values. Plain Dart, so each rule is unit tested.

/// SRS 3.9 / USE-003: every dynamic value carries its status.
///   current     -> "Current: Quiet"
///   hours_ago   -> "3 hours ago: Quiet" (whole hours since newestInputAt, at least 1)
///   historical  -> "Estimate based on historical data: Quiet"
///   unavailable -> "Unavailable"
String conditionText(ConditionValue c, {DateTime? now}) {
  final label = c.label;
  if (c.status == 'unavailable' || label == null) return 'Unavailable';
  switch (c.status) {
    case 'current':
      return 'Current: $label';
    case 'hours_ago':
      final at = c.newestInputAt;
      if (at == null) return 'Earlier today: $label';
      final hours = (now ?? DateTime.now()).difference(at).inHours;
      final n = hours < 1 ? 1 : hours;
      return '$n hour${n == 1 ? '' : 's'} ago: $label';
    case 'historical':
      return 'Estimate based on historical data: $label';
    default:
      return label;
  }
}

/// USE-004: crowd and noise are always shown as estimates; the backend also
/// flags estimates with isEstimate.
bool showAsEstimate(String kind, ConditionValue c) =>
    c.status != 'unavailable' && (c.isEstimate || kind == 'crowd' || kind == 'noise');

/// FR-012: "350 m" below 1 km, "1.2 km" from 1 km.
String distanceText(int? meters) {
  if (meters == null) return '';
  if (meters < 1000) return '$meters m';
  return '${(meters / 1000).toStringAsFixed(1)} km';
}

/// FR-016: price level 1..4 as E£ signs.
String priceText(int? level) {
  if (level == null || level < 1) return 'Price unknown';
  return 'E£' * (level > 4 ? 4 : level);
}

String yesNo(bool? v) => v == null ? 'Unknown' : (v ? 'Yes' : 'No');

String studyTypeText(String? v) => switch (v) {
      'individual' => 'Studying alone',
      'group' => 'Group study',
      'both' => 'Alone or in groups',
      _ => 'Unknown',
    };

const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/// One line per day; a missing day is closed (OpeningHours in the spec).
List<(String day, String hours)> openingHoursLines(OpeningHours? hours) {
  if (hours == null) return const [];
  return [
    for (var d = 0; d < 7; d++)
      (
        weekdays[d],
        (hours[d] ?? const []).isEmpty
            ? 'Closed'
            : hours[d]!.map((r) => '${r.open}–${r.close}').join(', '),
      ),
  ];
}
