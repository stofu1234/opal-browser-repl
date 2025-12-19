#!/usr/bin/env ruby
# frozen_string_literal: true

# Build Opal runtime with native module included
# Usage: ruby scripts/build-opal.rb

require 'opal'
require 'fileutils'

OUTPUT_DIR = File.expand_path('../src/shared/lib', __dir__)

FileUtils.mkdir_p(OUTPUT_DIR)

puts "Building Opal with native module..."
puts "Opal version: #{Opal::VERSION}"
puts ""

# Build opal runtime + parser + native
builder = Opal::Builder.new(stubs: [])

# Add opal's stdlib path
Opal.paths.each { |p| builder.append_paths(p) }

# Build core runtime
builder.build('opal')
opal_js = builder.to_s

# Build parser
parser_builder = Opal::Builder.new(stubs: [])
Opal.paths.each { |p| parser_builder.append_paths(p) }
parser_builder.build('opal-parser')
parser_js = parser_builder.to_s

# Build native module
native_builder = Opal::Builder.new(stubs: [])
Opal.paths.each { |p| native_builder.append_paths(p) }
native_builder.build('native')
native_js = native_builder.to_s

# Write files
File.write(File.join(OUTPUT_DIR, 'opal.js'), opal_js)
puts "  Created: opal.js (#{(opal_js.bytesize / 1024.0).round(1)} KB)"

File.write(File.join(OUTPUT_DIR, 'opal-parser.js'), parser_js)
puts "  Created: opal-parser.js (#{(parser_js.bytesize / 1024.0).round(1)} KB)"

File.write(File.join(OUTPUT_DIR, 'native.js'), native_js)
puts "  Created: native.js (#{(native_js.bytesize / 1024.0).round(1)} KB)"

# Create combined version (opal + parser + native)
combined_js = [opal_js, parser_js, native_js].join("\n")
File.write(File.join(OUTPUT_DIR, 'opal-full.js'), combined_js)
puts "  Created: opal-full.js (#{(combined_js.bytesize / 1024.0).round(1)} KB)"

puts ""
puts "Done! Files saved to src/shared/lib/"
