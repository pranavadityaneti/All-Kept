Pod::Spec.new do |s|
  s.name             = 'ShareSave'
  s.version          = '1.0.0'
  s.summary          = 'Credential and offline queue shared with the Allkept share extension'
  s.author           = 'Allkept'
  s.homepage         = 'https://www.allkept.app'
  s.license          = { type: 'UNLICENSED' }
  s.platforms        = { ios: '15.1' }
  s.swift_version    = '5.9'
  s.source           = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
