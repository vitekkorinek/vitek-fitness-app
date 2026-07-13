// Stub for react-native-gesture-handler — package ships without root index.d.ts in this version
declare module 'react-native-gesture-handler' {
  import React from 'react';
  import { ViewProps } from 'react-native';
  export const GestureHandlerRootView: React.FC<ViewProps>;
  export * from 'react-native-gesture-handler/lib/typescript/handlers/gestures/gestureHandlerCommon';
}
