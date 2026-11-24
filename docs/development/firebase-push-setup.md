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
check-ins disabled until setup is complete. Local backend development without
the service-account setting uses a fake push adapter that logs the message
instead of delivering it.
