// Side-effect module: imported FIRST from /index.ts so the Manrope wrapper is installed
// before expo-router (and with it RN's Animated preset, which captures <Text> at module
// init) loads anything. A plain call in index.ts wouldn't work — import statements are
// hoisted above module-body statements, so 'expo-router/entry' would run first.
import { installAppFont } from './appType';

installAppFont();
