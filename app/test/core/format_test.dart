import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/core/format.dart';
import 'package:studyspot/core/models/venue.dart';

void main() {
  final now = DateTime.utc(2026, 11, 1, 18, 0);

  ConditionValue c(String status, {String? label = 'Quiet', DateTime? at, bool est = false}) =>
      ConditionValue(status: status, label: label, newestInputAt: at, isEstimate: est);

  test('TC-M6-01 each status gets its own label (current, historical, unavailable)', () {
    expect(conditionText(c('current'), now: now), 'Current: Quiet');
    expect(conditionText(c('historical'), now: now), 'Estimate based on historical data: Quiet');
    expect(conditionText(c('unavailable', label: null), now: now), 'Unavailable');
    expect(conditionText(c('current', label: null), now: now), 'Unavailable',
        reason: 'no label means nothing to show');
  });

  test('TC-M6-02 "X hours ago" counts whole hours, at least 1 (BVA 59 min, 1 h, 3 h 59, 23 h)', () {
    String ago(Duration d) => conditionText(c('hours_ago', at: now.subtract(d)), now: now);
    expect(ago(const Duration(minutes: 59)), '1 hour ago: Quiet');
    expect(ago(const Duration(hours: 1)), '1 hour ago: Quiet');
    expect(ago(const Duration(hours: 3, minutes: 59)), '3 hours ago: Quiet');
    expect(ago(const Duration(hours: 23)), '23 hours ago: Quiet');
  });

  test('TC-M6-03 crowd and noise are always marked as estimates; Wi-Fi only when flagged', () {
    expect(showAsEstimate('crowd', c('current')), isTrue);
    expect(showAsEstimate('noise', c('historical')), isTrue);
    expect(showAsEstimate('wifi', c('current')), isFalse);
    expect(showAsEstimate('wifi', c('historical', est: true)), isTrue);
    expect(showAsEstimate('crowd', c('unavailable', label: null)), isFalse);
  });

  test('TC-M6-04 distance: metres below 1 km, km with one decimal from 1 km (BVA 999 / 1000)', () {
    expect(distanceText(0), '0 m');
    expect(distanceText(999), '999 m');
    expect(distanceText(1000), '1.0 km');
    expect(distanceText(1250), '1.3 km');
    expect(distanceText(null), '');
  });

  test('TC-M6-05 price and opening hours: unknown price, 1 to 4 signs, closed days', () {
    expect(priceText(null), 'Price unknown');
    expect(priceText(1), 'E£');
    expect(priceText(4), 'E£E£E£E£');
    final lines = openingHoursLines({
      0: [(open: '08:00', close: '23:00')],
    });
    expect(lines.first, ('Sunday', '08:00–23:00'));
    expect(lines[1], ('Monday', 'Closed'));
    expect(openingHoursLines(null), isEmpty);
  });
}
