/**
 * Test script for ls command
 * Run this in the browser console on a page with Opal loaded
 */

function testLsCommand() {
  console.log('=== Testing ls command logic ===\n');

  // Test with a class (FormValidationController or Greeter)
  const testClass = typeof FormValidationController !== 'undefined' 
    ? FormValidationController 
    : (typeof Greeter !== 'undefined' ? Greeter : null);

  if (!testClass) {
    console.log('No test class found. Available classes:');
    console.log(Object.keys(Opal.Object.$$const || {}).join(', '));
    return;
  }

  console.log('Testing class:', testClass.$$name);
  console.log('$$is_class:', testClass.$$is_class);
  console.log('$$is_module:', testClass.$$is_module);

  // Check what properties the class has
  console.log('\n=== Class properties ===');
  console.log('$$prototype:', testClass.$$prototype ? 'exists' : 'none');
  console.log('$$smethods:', testClass.$$smethods);
  console.log('$$const:', testClass.$$const ? Object.keys(testClass.$$const) : 'none');

  // Get own property names on the class itself
  console.log('\n=== Own properties on class ===');
  const ownProps = Object.getOwnPropertyNames(testClass);
  const methods = ownProps.filter(k => k.startsWith('$') && typeof testClass[k] === 'function');
  console.log('Methods on class object:', methods.map(m => m.substring(1)));

  // Get methods from prototype
  if (testClass.$$prototype) {
    console.log('\n=== Methods in $$prototype ===');
    const protoProps = Object.getOwnPropertyNames(testClass.$$prototype);
    const protoMethods = protoProps.filter(k => k.startsWith('$') && typeof testClass.$$prototype[k] === 'function');
    console.log('Instance methods:', protoMethods.map(m => m.substring(1)));
  }

  // Check singleton class
  if (testClass.$$singleton) {
    console.log('\n=== Singleton class ===');
    console.log('$$singleton:', testClass.$$singleton);
    console.log('Singleton methods:', Object.getOwnPropertyNames(testClass.$$singleton));
  }

  // Check Opal's method listing
  console.log('\n=== Using Opal methods ===');
  if (typeof testClass.$instance_methods === 'function') {
    try {
      const instanceMethods = testClass.$instance_methods(false);
      console.log('$instance_methods(false):', instanceMethods);
    } catch (e) {
      console.log('Error calling $instance_methods:', e.message);
    }
  }

  if (typeof testClass.$methods === 'function') {
    try {
      const classMethods = testClass.$methods(false);
      console.log('$methods(false):', classMethods);
    } catch (e) {
      console.log('Error calling $methods:', e.message);
    }
  }
}

testLsCommand();
