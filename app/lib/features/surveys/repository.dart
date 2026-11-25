import '../../core/api/api_client.dart';
import '../../core/models/survey.dart';

class SurveysRepository {
  SurveysRepository(this._api);

  final ApiClient _api;

  Future<StoredSurvey> submit(String venueId, SurveyAnswers answers) =>
      _api.submitSurvey(venueId, answers);
}
