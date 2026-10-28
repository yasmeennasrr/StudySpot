import 'package:flutter/widgets.dart';

import '../state/view_model.dart';

/// Creates a view model when the screen opens, rebuilds the screen when the
/// view model calls notify(), and disposes it when the screen closes.
class ViewModelBuilder<T extends ViewModel> extends StatefulWidget {
  const ViewModelBuilder({
    super.key,
    required this.create,
    required this.builder,
    this.onReady,
  });

  final T Function(BuildContext context) create;
  final Widget Function(BuildContext context, T viewModel) builder;

  /// Runs once after creation, e.g. to load data.
  final void Function(T viewModel)? onReady;

  @override
  State<ViewModelBuilder<T>> createState() => _ViewModelBuilderState<T>();
}

class _ViewModelBuilderState<T extends ViewModel> extends State<ViewModelBuilder<T>> {
  late final T _viewModel;

  @override
  void initState() {
    super.initState();
    _viewModel = widget.create(context);
    _viewModel.addListener(_rebuild);
    widget.onReady?.call(_viewModel);
  }

  void _rebuild() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _viewModel.removeListener(_rebuild);
    _viewModel.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.builder(context, _viewModel);
}
