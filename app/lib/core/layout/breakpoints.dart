/// Window size classes (Material 3 layout guidance), so every screen adapts
/// the same way from a phone to a laptop (DRS feedback, USE-001).
///
///   compact   < 600   phones: bottom navigation bar, one column
///   medium    < 840   tablets, small windows: navigation rail
///   expanded  < 1200  laptops: rail, Explore shows list and map side by side
///   large    >= 1200  wide screens: rail with labels
enum WindowSize { compact, medium, expanded, large }

WindowSize windowSizeOf(double width) {
  if (width < 600) return WindowSize.compact;
  if (width < 840) return WindowSize.medium;
  if (width < 1200) return WindowSize.expanded;
  return WindowSize.large;
}

/// Width from which Explore shows the list and the map side by side.
const double splitViewMinWidth = 900;

/// Readable widths: text lines and forms stop growing here on wide screens.
const double formMaxWidth = 560;
const double pageMaxWidth = 760;
const double wideContentMaxWidth = 1080;
