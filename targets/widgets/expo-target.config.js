/** @type {import('@bacons/apple-targets').Config} */
module.exports = {
  type: 'widget',
  name: 'VFWidgets',
  displayName: 'Vitek Fitness',
  // Live Activities (ActivityKit + Dynamic Island APIs) need iOS 16.2.
  deploymentTarget: '16.2',
  frameworks: ['SwiftUI', 'WidgetKit', 'ActivityKit'],
};
