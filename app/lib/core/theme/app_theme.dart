import 'package:flutter/material.dart';

/// StudySpot's look ("map first"): graphite neutrals with a cobalt accent,
/// DM Serif Display for headings and DM Sans for everything else. Every screen
/// takes its colours and fonts from here, so nothing is hard-coded elsewhere.
///
/// Only colours, fonts, corners and borders are set here. Font sizes, paddings
/// and heights stay at Material 3's defaults, so layouts are unchanged.
abstract final class AppTheme {
  /// Body text, labels, buttons, numbers.
  static const sans = 'DM Sans';

  /// Headings, screen titles, place names.
  static const serif = 'DM Serif Display';

  static ThemeData light() => _build(_lightScheme, StatusColors.light);
  static ThemeData dark() => _build(_darkScheme, StatusColors.dark);

  static const _lightScheme = ColorScheme(
    brightness: Brightness.light,
    primary: Color(0xFF3150D0),
    onPrimary: Color(0xFFFFFFFF),
    primaryContainer: Color(0xFFE0E6FB),
    onPrimaryContainer: Color(0xFF22389A),
    secondary: Color(0xFF4A5577),
    onSecondary: Color(0xFFFFFFFF),
    secondaryContainer: Color(0xFFE6E9F2),
    onSecondaryContainer: Color(0xFF1F2A44),
    tertiary: Color(0xFF0F8F6F),
    onTertiary: Color(0xFFFFFFFF),
    tertiaryContainer: Color(0xFFD5F1E8),
    onTertiaryContainer: Color(0xFF07513F),
    error: Color(0xFFBA1A1A),
    onError: Color(0xFFFFFFFF),
    errorContainer: Color(0xFFFFDAD6),
    onErrorContainer: Color(0xFF410002),
    surface: Color(0xFFF4F5F7),
    onSurface: Color(0xFF15171C),
    onSurfaceVariant: Color(0xFF5F6470),
    surfaceContainerLowest: Color(0xFFFFFFFF),
    surfaceContainerLow: Color(0xFFF9FAFB),
    surfaceContainer: Color(0xFFEFF1F4),
    surfaceContainerHigh: Color(0xFFE9EBEF),
    surfaceContainerHighest: Color(0xFFE3E6EA),
    outline: Color(0xFF6B7080),
    outlineVariant: Color(0xFFE2E4E9),
    shadow: Color(0xFF000000),
    scrim: Color(0xFF000000),
    inverseSurface: Color(0xFF2A2D34),
    onInverseSurface: Color(0xFFF1F2F4),
    inversePrimary: Color(0xFFB8C5FF),
    surfaceTint: Color(0x00000000),
  );

  static const _darkScheme = ColorScheme(
    brightness: Brightness.dark,
    primary: Color(0xFF8AA9FF),
    onPrimary: Color(0xFF0E1C4D),
    primaryContainer: Color(0xFF253A8A),
    onPrimaryContainer: Color(0xFFDCE3FF),
    secondary: Color(0xFFB9C2DB),
    onSecondary: Color(0xFF232B40),
    secondaryContainer: Color(0xFF343C52),
    onSecondaryContainer: Color(0xFFDCE2F4),
    tertiary: Color(0xFF5FD3AE),
    onTertiary: Color(0xFF003829),
    tertiaryContainer: Color(0xFF0B5A45),
    onTertiaryContainer: Color(0xFFA7F0D6),
    error: Color(0xFFFFB4AB),
    onError: Color(0xFF690005),
    errorContainer: Color(0xFF93000A),
    onErrorContainer: Color(0xFFFFDAD6),
    surface: Color(0xFF111318),
    onSurface: Color(0xFFE4E6EB),
    onSurfaceVariant: Color(0xFFA3A8B4),
    surfaceContainerLowest: Color(0xFF181B21),
    surfaceContainerLow: Color(0xFF171A20),
    surfaceContainer: Color(0xFF1B1E25),
    surfaceContainerHigh: Color(0xFF22262E),
    surfaceContainerHighest: Color(0xFF2B2F38),
    outline: Color(0xFF8D92A0),
    outlineVariant: Color(0xFF2C3039),
    shadow: Color(0xFF000000),
    scrim: Color(0xFF000000),
    inverseSurface: Color(0xFFE4E6EB),
    onInverseSurface: Color(0xFF2A2D34),
    inversePrimary: Color(0xFF3150D0),
    surfaceTint: Color(0x00000000),
  );

  static ThemeData _build(ColorScheme scheme, StatusColors status) {
    final base = ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      fontFamily: sans,
    );
    final text = _textTheme(base.textTheme);
    final card = scheme.surfaceContainerLowest;
    final rounded12 = RoundedRectangleBorder(borderRadius: BorderRadius.circular(12));
    final hairline = BorderSide(color: scheme.outlineVariant);

    return base.copyWith(
      scaffoldBackgroundColor: scheme.surface,
      textTheme: text,
      extensions: [status],
      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        titleTextStyle: text.titleLarge?.copyWith(color: scheme.onSurface),
      ),
      cardTheme: CardThemeData(
        color: card,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(14),
          side: hairline,
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        indicatorColor: scheme.primaryContainer,
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            color: states.contains(WidgetState.selected)
                ? scheme.onPrimaryContainer
                : scheme.onSurfaceVariant,
          ),
        ),
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => text.labelMedium?.copyWith(
            color: states.contains(WidgetState.selected)
                ? scheme.onSurface
                : scheme.onSurfaceVariant,
            fontWeight: states.contains(WidgetState.selected)
                ? FontWeight.w600
                : FontWeight.w500,
          ),
        ),
      ),
      navigationRailTheme: NavigationRailThemeData(
        backgroundColor: card,
        indicatorColor: scheme.primaryContainer,
        selectedIconTheme: IconThemeData(color: scheme.onPrimaryContainer),
        unselectedIconTheme: IconThemeData(color: scheme.onSurfaceVariant),
        selectedLabelTextStyle: text.labelMedium?.copyWith(
          color: scheme.onSurface,
          fontWeight: FontWeight.w600,
        ),
        unselectedLabelTextStyle: text.labelMedium?.copyWith(color: scheme.onSurfaceVariant),
      ),
      filledButtonTheme: FilledButtonThemeData(style: FilledButton.styleFrom(shape: rounded12)),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          shape: rounded12,
          elevation: 0,
          backgroundColor: scheme.primaryContainer,
          foregroundColor: scheme.onPrimaryContainer,
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(shape: rounded12, side: BorderSide(color: scheme.outlineVariant)),
      ),
      textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(shape: rounded12)),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        elevation: 1,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: card,
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: hairline),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: hairline),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.primary, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.error),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.error, width: 1.6),
        ),
        hintStyle: TextStyle(color: scheme.onSurfaceVariant),
        prefixIconColor: scheme.onSurfaceVariant,
        suffixIconColor: scheme.onSurfaceVariant,
      ),
      chipTheme: base.chipTheme.copyWith(
        backgroundColor: card,
        selectedColor: scheme.primaryContainer,
        side: hairline,
        shape: const StadiumBorder(),
        checkmarkColor: scheme.onPrimaryContainer,
        labelStyle: text.labelLarge?.copyWith(color: scheme.onSurface),
        secondaryLabelStyle: text.labelLarge?.copyWith(color: scheme.onPrimaryContainer),
      ),
      segmentedButtonTheme: SegmentedButtonThemeData(
        style: SegmentedButton.styleFrom(
          selectedBackgroundColor: scheme.primaryContainer,
          selectedForegroundColor: scheme.onPrimaryContainer,
          side: hairline,
        ),
      ),
      dividerTheme: DividerThemeData(color: scheme.outlineVariant),
      listTileTheme: ListTileThemeData(iconColor: scheme.onSurfaceVariant),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      dialogTheme: DialogThemeData(
        backgroundColor: card,
        surfaceTintColor: Colors.transparent,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        titleTextStyle: text.headlineSmall?.copyWith(color: scheme.onSurface),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        shape: rounded12,
        backgroundColor: scheme.inverseSurface,
        contentTextStyle: text.bodyMedium?.copyWith(color: scheme.onInverseSurface),
        actionTextColor: scheme.inversePrimary,
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(color: scheme.primary),
    );
  }

  /// Serif for display, headline and large titles; DM Sans (semi-bold) for
  /// smaller titles and labels. Sizes are Material 3's own.
  static TextTheme _textTheme(TextTheme t) {
    TextStyle? heading(TextStyle? s) =>
        s?.copyWith(fontFamily: serif, fontWeight: FontWeight.w400, letterSpacing: 0);
    TextStyle? semi(TextStyle? s) => s?.copyWith(fontWeight: FontWeight.w600);
    return t.copyWith(
      displayLarge: heading(t.displayLarge),
      displayMedium: heading(t.displayMedium),
      displaySmall: heading(t.displaySmall),
      headlineLarge: heading(t.headlineLarge),
      headlineMedium: heading(t.headlineMedium),
      headlineSmall: heading(t.headlineSmall),
      titleLarge: heading(t.titleLarge),
      titleMedium: semi(t.titleMedium),
      titleSmall: semi(t.titleSmall),
      labelLarge: semi(t.labelLarge),
    );
  }
}

/// Colours with a meaning that the Material scheme has no slot for.
@immutable
class StatusColors extends ThemeExtension<StatusColors> {
  const StatusColors({
    required this.success,
    required this.warning,
    required this.historical,
    required this.rating,
  });

  /// Open now, done, location allowed.
  final Color success;

  /// A condition reported a few hours ago.
  final Color warning;

  /// A condition estimated from historical data.
  final Color historical;

  /// Review stars.
  final Color rating;

  static const light = StatusColors(
    success: Color(0xFF1F8A4C),
    warning: Color(0xFFA15C00),
    historical: Color(0xFF5B5FC7),
    rating: Color(0xFFB7791F),
  );

  static const dark = StatusColors(
    success: Color(0xFF6BD49A),
    warning: Color(0xFFF5B860),
    historical: Color(0xFFA9ACF5),
    rating: Color(0xFFF2C14E),
  );

  /// The current theme's colours (the light set if a theme has none).
  static StatusColors of(BuildContext context) =>
      Theme.of(context).extension<StatusColors>() ?? light;

  @override
  StatusColors copyWith({Color? success, Color? warning, Color? historical, Color? rating}) =>
      StatusColors(
        success: success ?? this.success,
        warning: warning ?? this.warning,
        historical: historical ?? this.historical,
        rating: rating ?? this.rating,
      );

  @override
  StatusColors lerp(StatusColors? other, double t) {
    if (other == null) return this;
    return StatusColors(
      success: Color.lerp(success, other.success, t)!,
      warning: Color.lerp(warning, other.warning, t)!,
      historical: Color.lerp(historical, other.historical, t)!,
      rating: Color.lerp(rating, other.rating, t)!,
    );
  }
}
