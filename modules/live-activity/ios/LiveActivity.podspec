Pod::Spec.new do |s|
  s.name           = 'LiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'Workout Live Activity control'
  s.description    = 'Starts, updates and ends the workout Live Activity (Dynamic Island + lock screen).'
  s.author         = 'Vitek Fitness'
  s.homepage       = 'https://github.com/vitekkorinek/vitek-fitness-app'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.license        = { :type => 'MIT' }
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES'
  }
  s.source_files = '**/*.{h,m,mm,swift,hpp,cpp}'
end
