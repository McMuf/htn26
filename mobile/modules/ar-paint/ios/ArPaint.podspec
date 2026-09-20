Pod::Spec.new do |s|
  s.name           = 'ArPaint'
  s.version        = '1.0.0'
  s.summary        = 'ARKit surface painting view for Tagged'
  s.description    = 'Detects planes with ARKit and composites spray-paint dabs into textures anchored to them.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'ARKit', 'SceneKit', 'MapKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
