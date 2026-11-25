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
/// The last [maxPairs] exchanges go along too, so follow-ups make sense.
class StudyMatchViewModel extends ViewModel {
  StudyMatchViewModel({required this.api, required this.location});

  final ApiClient api;
  final LocationService location;

  static const maxLength = 500;

  /// Earlier question/answer pairs sent with a question (6 messages).
  static const maxPairs = 3;

  /// Longest text of one earlier message (contracts/openapi.yaml).
  static const maxHistoryText = 1000;

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
        history: _history(),
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

  /// The last answered questions, oldest first. A question that failed has no
  /// answer right after it, so it is left out (the backend wants whole pairs).
  List<StudyMatchMessage> _history() {
    final pairs = <List<StudyMatchMessage>>[];
    for (var i = 0; i + 1 < messages.length; i++) {
      final answer = messages[i + 1].answer;
      if (!messages[i].fromStudent || answer == null) continue;
      pairs.add([
        StudyMatchMessage(fromStudent: true, text: messages[i].text),
        StudyMatchMessage(fromStudent: false, text: _answerText(answer)),
      ]);
    }
    final from = pairs.length > maxPairs ? pairs.length - maxPairs : 0;
    return [for (final pair in pairs.skip(from)) ...pair];
  }

  /// What the student saw, as text: the reply and the names on the place cards,
  /// which a follow-up may point at ("the second one"). The "unavailable" notice
  /// is left out so the AI does not repeat it once it is back.
  String _answerText(StudyMatchAnswer answer) {
    final names = answer.recommendations.map((r) => r.venue.name).join(', ');
    final places = names.isEmpty ? '' : 'Places shown: $names';
    final reply = answer.degraded ? '' : answer.reply.trim();
    if (reply.isEmpty) return places.isEmpty ? '(No answer.)' : _cut(places, maxHistoryText);
    if (places.isEmpty) return _cut(reply, maxHistoryText);
    final tail = _cut('\n$places', maxHistoryText ~/ 2);
    return _cut(reply, maxHistoryText - tail.length) + tail;
  }

  String _cut(String text, int max) =>
      text.length <= max ? text : text.substring(0, max);

  Future<DevicePosition?> _locationIfGranted() async {
    try {
      // Null without permission (SEN-002), so no extra check here.
      return await location.currentPosition();
    } catch (_) {
      return null; // No location is fine: StudyMatch asks for an area instead.
    }
  }
}
