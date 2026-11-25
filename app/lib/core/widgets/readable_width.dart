import 'package:flutter/material.dart';

/// Keeps a page at a readable width on wide screens (DRS feedback: on a laptop
/// the screens were stretched edge to edge). Below [maxWidth] the page fills
/// the window as before; above it, the page is centred as a column with the
/// app's surface colour on both sides. Below 840 (phones, tablets in portrait)
/// pages fill the window as before.
class ReadableWidth extends StatelessWidget {
  const ReadableWidth({super.key, required this.maxWidth, required this.child});

  final double maxWidth;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        // Phones and tablets in portrait fill the screen; from a laptop-sized
        // window (840, see breakpoints.dart) the page keeps a readable width.
        if (!constraints.hasBoundedWidth ||
            constraints.maxWidth < 840 ||
            constraints.maxWidth <= maxWidth + 32) {
          return child;
        }
        final scheme = Theme.of(context).colorScheme;
        return ColoredBox(
          color: scheme.surfaceContainerLow,
          child: Center(
            child: Container(
              width: maxWidth,
              height: constraints.hasBoundedHeight ? constraints.maxHeight : null,
              decoration: BoxDecoration(
                border: Border.symmetric(
                  vertical: BorderSide(color: scheme.outlineVariant),
                ),
              ),
              child: child,
            ),
          ),
        );
      },
    );
  }
}
