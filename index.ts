// Custom entry (package.json "main") — exists ONLY to install the app-wide Manrope
// Text/TextInput wrapper before anything else initializes. See lib/appType.ts.
import './lib/installAppFont';
import 'expo-router/entry';
