import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:studyspot/app.dart';
import 'package:studyspot/core/models/venue.dart';
import 'package:studyspot/core/services.dart';
import 'package:studyspot/core/widgets/venue_photo.dart';

import '../../helpers.dart';

const _photo = 'https://images.unsplash.com/photo-1511081692775-05d0f180a065?w=1200';

void main() {
  test('TC-M6-55 a venue keeps an https photo link; http, other schemes, broken or missing links count as no photo (FR-016)', () {
    VenueSummary parse(Object? photoUrl) =>
        VenueSummary.fromJson({'id': 'v1', 'name': 'Café', 'photoUrl': photoUrl});

    expect(parse(_photo).photoUrl, _photo);
    for (final bad in [
      null,
      '',
      'http://images.unsplash.com/photo-1',
      'javascript:alert(1)',
      'data:image/png;base64,AAAA',
      'https://',
      'not a link',
      42,
    ]) {
      expect(parse(bad).photoUrl, isNull, reason: '$bad');
    }
    // Kept when the app adds a distance to a venue ("All places").
    expect(parse(_photo).copyWithDistance(500).photoUrl, _photo);
    // The details answer carries it in the static group.
    final details = VenueDetails.fromJson({
      'static': {'id': 'v1', 'name': 'Café', 'photoUrl': _photo},
      'dynamic': null,
    });
    expect(details.venue.photoUrl, _photo);
  });

  testWidgets('TC-M6-56 the photo shows a placeholder when there is no photo or no network, never an error (FR-016)', (tester) async {
    final w = TestWorld();
    Future<void> show(String? url) => tester.pumpWidget(
          AppScope(
            services: w.services,
            child: MaterialApp(
              home: Center(child: VenuePhoto(url: url, width: 76, height: 76)),
            ),
          ),
        );

    await show(null);
    expect(find.byKey(const Key('venue_photo_placeholder')), findsOneWidget);
    expect(find.byKey(const Key('venue_photo_image')), findsNothing);
    expect(tester.getSize(find.byType(VenuePhoto)), const Size(76, 76));

    // Tests have no network (loadNetworkImages: false), so even a real link
    // shows the placeholder.
    await show(_photo);
    expect(find.byKey(const Key('venue_photo_placeholder')), findsOneWidget);
    expect(find.byKey(const Key('venue_photo_image')), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('TC-M6-57 list cards always have a photo spot; the details page shows the photo only for a place that has one (FR-012, FR-016)', (tester) async {
    final w = TestWorld();
    final withPhoto = w.api.venues[1];
    w.api.venues[1] = VenueSummary(
      id: withPhoto.id,
      name: withPhoto.name,
      lat: withPhoto.lat,
      lng: withPhoto.lng,
      area: withPhoto.area,
      photoUrl: _photo,
      priceLevel: withPhoto.priceLevel,
      wifiAvailable: withPhoto.wifiAvailable,
      outletsAvailable: withPhoto.outletsAvailable,
      studyType: withPhoto.studyType,
    );
    final noPhoto = w.api.venues[0];

    await tester.pumpWidget(StudySpotApp(services: w.services));
    await tester.pumpAndSettle();
    for (final v in w.api.venues) {
      expect(
        find.descendant(
          of: find.byKey(Key('venue_${v.id}')),
          matching: find.byType(VenuePhoto),
        ),
        findsOneWidget,
      );
    }

    await tester.tap(find.byKey(Key('venue_${withPhoto.id}')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('venue_details_photo')), findsOneWidget);
    expect(find.text('Conditions now'), findsOneWidget);

    Navigator.of(tester.element(find.text('Conditions now'))).pop();
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(Key('venue_${noPhoto.id}')));
    await tester.pumpAndSettle();
    expect(find.text('Conditions now'), findsOneWidget);
    expect(find.byKey(const Key('venue_details_photo')), findsNothing);
  });
}
