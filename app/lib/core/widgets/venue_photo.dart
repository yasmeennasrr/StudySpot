import 'package:flutter/material.dart';

import '../services.dart';

/// A place's photo, cropped to fill [width] x [height] with rounded corners.
/// Shows a calm placeholder (a café icon on a tint) while it loads, when the
/// place has no photo, when the photo cannot be loaded, and in tests (no
/// network). The place's name is always next to it, so the photo is decorative
/// for screen readers.
class VenuePhoto extends StatelessWidget {
  const VenuePhoto({
    super.key,
    required this.url,
    this.width,
    this.height,
    this.radius = 12,
    this.iconSize = 26,
  });

  final String? url;
  final double? width;
  final double? height;
  final double radius;
  final double iconSize;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final services = context.getInheritedWidgetOfExactType<AppScope>()?.services;
    final load = url != null && (services?.loadNetworkImages ?? true);

    final placeholder = Container(
      key: const Key('venue_photo_placeholder'),
      color: scheme.primaryContainer,
      alignment: Alignment.center,
      child: Icon(
        Icons.local_cafe_outlined,
        size: iconSize,
        color: scheme.onPrimaryContainer.withValues(alpha: 0.7),
      ),
    );

    Widget child = placeholder;
    if (load) {
      // Decode no bigger than shown, to keep memory low in long lists.
      final ratio = MediaQuery.maybeDevicePixelRatioOf(context) ?? 1;
      final cacheWidth = width == null || !width!.isFinite ? null : (width! * ratio).round();
      child = Image.network(
        url!,
        key: const Key('venue_photo_image'),
        fit: BoxFit.cover,
        width: width,
        height: height,
        cacheWidth: cacheWidth,
        excludeFromSemantics: true,
        // On the web, fall back to a plain <img> if the photo host does not
        // allow the app to read the image (CORS).
        webHtmlElementStrategy: WebHtmlElementStrategy.fallback,
        frameBuilder: (context, image, frame, synchronous) => synchronous || frame != null
            ? image
            : ColoredBox(color: scheme.surfaceContainerHigh, child: const SizedBox.expand()),
        errorBuilder: (context, error, stack) => placeholder,
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: SizedBox(width: width, height: height, child: child),
    );
  }
}
