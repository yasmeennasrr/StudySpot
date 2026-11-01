import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/models/venue.dart';
import '../../core/state/view_model.dart';

/// PB-11 / UC-04: a venue's static information, its conditions with status
/// labels, and its reviews (FR-016 to FR-021).
class VenueDetailsViewModel extends ViewModel {
  VenueDetailsViewModel({required this.api, required this.venueId});

  final ApiClient api;
  final String venueId;

  bool loading = true;
  String? error;
  VenueDetails? details;

  Future<void> load() async {
    loading = true;
    error = null;
    notify();
    try {
      details = VenueDetails.fromJson(await api.getVenue(venueId));
    } on ApiError catch (e) {
      error = e.message;
    } finally {
      loading = false;
      notify();
    }
  }
}
