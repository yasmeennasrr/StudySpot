import '../../core/api/api_error.dart';
import '../../core/models/survey.dart';
import '../../core/state/view_model.dart';
import 'repository.dart';

class SurveyFormViewModel extends ViewModel {
  SurveyFormViewModel(this._repository, {required this.venueId});

  final SurveysRepository _repository;
  final String venueId;

  String? crowd;
  String? noise;
  String? wifi;
  bool saving = false;
  String? error;

  bool get canSubmit => !saving && (crowd != null || noise != null || wifi != null);

  void setCrowd(String? value) {
    crowd = value;
    error = null;
    notify();
  }

  void setNoise(String? value) {
    noise = value;
    error = null;
    notify();
  }

  void setWifi(String? value) {
    wifi = value;
    error = null;
    notify();
  }

  Future<StoredSurvey?> submit() async {
    if (!canSubmit) {
      error = 'Answer at least one question.';
      notify();
      return null;
    }
    saving = true;
    error = null;
    notify();
    try {
      return await _repository.submit(
        venueId,
        SurveyAnswers(crowd: crowd, noise: noise, wifi: wifi),
      );
    } on ApiError catch (e) {
      error = e.message;
      return null;
    } finally {
      saving = false;
      notify();
    }
  }
}
