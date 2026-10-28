/// Base class for every view model (MVVM, SDS 8).
///
/// Plain Dart on purpose: view models hold screen state and logic but import
/// nothing from Flutter, so they can be unit-tested without building widgets.
/// Views listen through [ViewModelBuilder] (core/widgets).
abstract class ViewModel {
  final List<void Function()> _listeners = [];
  bool _disposed = false;

  bool get isDisposed => _disposed;

  void addListener(void Function() listener) => _listeners.add(listener);

  void removeListener(void Function() listener) => _listeners.remove(listener);

  /// Tells the view to rebuild.
  void notify() {
    if (_disposed) return;
    for (final listener in List.of(_listeners)) {
      listener();
    }
  }

  void dispose() {
    _disposed = true;
    _listeners.clear();
  }
}
