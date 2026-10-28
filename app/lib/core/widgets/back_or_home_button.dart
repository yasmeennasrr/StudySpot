import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// Back arrow that always works: goes back when there is a previous screen,
/// otherwise home. Needed after a redirect (e.g. sign-in forwarding to
/// Preferences) leaves no previous screen to go back to.
class BackOrHomeButton extends StatelessWidget {
  const BackOrHomeButton({super.key});

  @override
  Widget build(BuildContext context) {
    return BackButton(
      onPressed: () {
        if (context.canPop()) {
          context.pop();
        } else {
          context.go('/home');
        }
      },
    );
  }
}
