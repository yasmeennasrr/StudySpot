# Firebase push setup for PB-31

The app uses Firebase Cloud Messaging for presence prompts. The Firebase
configuration belongs to the team's Firebase project and is intentionally not
committed to this repository.

## Firebase project setup

1. Create or select the team's Firebase project.
2. Register the Android app ID `edu.aucegypt.studyspot`.
3. Register the iOS bundle ID `edu.aucegypt.studyspot`.
4. Download the Android `google-services.json` file to
   `app/android/app/google-services.json`. Download the iOS
   `GoogleService-Info.plist` file to `app/ios/Runner/GoogleService-Info.plist`.
   Both project-specific files are ignored by Git.

5. In Firebase project settings, create a service account for server messaging
   and store its JSON securely as `FCM_SERVICE_ACCOUNT_JSON` in the backend
   environment. Never commit the service-account JSON.
6. For iOS, enable Push Notifications in Xcode and upload the Apple Push
   Notifications authentication key to Firebase Cloud Messaging settings.
7. Rebuild and run on a physical device. Android emulators need Google Play
   services; iOS remote push requires an Apple device and valid APNs setup.

The app catches missing Firebase platform configuration and leaves push
check-ins disabled until setup is complete. When Firebase client configuration
is absent, the app enables an in-app demo simulator from Presence settings. The
demo shows the check-in prompt and Yes/No response UI without registering a
device, calling the response API, or recording a presence. Local backend
development without the service-account setting uses a fake push adapter that
logs the message instead of delivering it.

## Demonstrating PB-31 without provider accounts

1. Run the app without `google-services.json` and
   `GoogleService-Info.plist`.
2. Open **Account → “Are you here?” check-ins**. On a fresh install, the
   presence onboarding screen appears before the home screen.
3. Tap **Simulate check-in notification**, then **Answer** on the in-app demo
   notification.
4. Choose **Yes, I’m here** or **No, I’m not here**. The screen labels the
   response as simulated and does not send it to the backend.
