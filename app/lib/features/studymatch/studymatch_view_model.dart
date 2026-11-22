import '../../core/api/api_client.dart';
import '../../core/api/api_error.dart';
import '../../core/location/location_service.dart';
import '../../core/models/studymatch.dart';
import '../../core/state/view_model.dart';

/// One bubble in the chat. Student messages have only [text]; StudyMatch
/// messages carry the full [answer] (reply, places, degraded flag).
class ChatMessage {
  const ChatMessage.student(this.text) : fromStudent = true, answer = null;
  ChatMessage.studyMatch(StudyMatchAnswer this.answer)
    : fromStudent = false,
      text = answer.reply;

  final bool fromStudent;
  final String text;
  final StudyMatchAnswer? answer;
}

/// PB-29 / UC-05: ask StudyMatch in your own words (AI-001).
///
/// The question shows at once; a progress indicator runs while the backend
/// answers (PERF-007). The location goes with the question only when the
/// student has granted it (AI-003, SEN-002); it is never requested from here.
class StudyMatchViewModel extends ViewModel {
  StudyMatchViewModel({required this.api, required this.location});

  final ApiClient api;
  final LocationService location;

  static const maxLength = 500;

  final List<ChatMessage> messages = [];
  String draft = '';
  bool sending = false;

  /// A failure that never reached StudyMatch (no connection, rate limit...).
  String? error;
  String? _failedQuestion;

  bool get canSend =>
      !sending && draft.trim().isNotEmpty && draft.length <= maxLength;
  bool get canRetry => !sending && _failedQuestion != null;

  void setDraft(String value) {
    draft = value;
    notify();
  }

  /// Sends [draft]; true when it was sent (the view then clears the field).
  Future<bool> send() async {
    if (!canSend) return false;
    final question = draft.trim();
    draft = '';
    messages.add(ChatMessage.student(question));
    await _ask(question);
    return true;
  }

  /// A suggestion chip: asks [text] directly, leaving the typed draft alone.
  Future<void> sendSuggestion(String text) async {
    if (sending) return;
    messages.add(ChatMessage.student(text));
    await _ask(text);
  }

  /// Asks the last failed question again (the student bubble is already there).
  Future<void> retry() async {
    final question = _failedQuestion;
    if (question == null || sending) return;
    await _ask(question);
  }

  Future<void> _ask(String question) async {
    sending = true;
    error = null;
    _failedQuestion = null;
    notify();
    try {
      final here = await _locationIfGranted();
      final answer = await api.askStudyMatch(
        question,
        lat: here?.lat,
        lng: here?.lng,
      );
      messages.add(ChatMessage.studyMatch(answer));
    } on ApiError catch (e) {
      error = e.statusCode == 429
          ? 'You asked a lot in a short time. Wait a minute, then try again.'
          : e.message;
      _failedQuestion = question;
    } finally {
      sending = false;
      notify();
    }
  }

  Future<DevicePosition?> _locationIfGranted() async {
    try {
      if (await location.currentAccess() != LocationAccess.granted) return null;
      return await location.currentPosition();
    } catch (_) {
      return null; // No location is fine: StudyMatch asks for an area instead.
    }
  }
}
