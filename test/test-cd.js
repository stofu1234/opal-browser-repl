// Test cd/ls commands with jsdom
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read Opal files
const opalJs = fs.readFileSync(path.join(__dirname, '../dist/chrome/lib/opal.js'), 'utf-8');
const opalParserJs = fs.readFileSync(path.join(__dirname, '../dist/chrome/lib/opal-parser.js'), 'utf-8');

// Create DOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  runScripts: 'dangerously'
});

const { window } = dom;

// Helper to execute code in window context
function evalInWindow(code) {
  const script = window.document.createElement('script');
  script.textContent = `window.__evalResult__ = ${code}`;
  window.document.body.appendChild(script);
  return window.__evalResult__;
}

// Execute Opal in the window context
const script = window.document.createElement('script');
script.textContent = opalJs + '\n' + opalParserJs;
window.document.body.appendChild(script);

console.log('Opal loaded:', typeof window.Opal !== 'undefined');

// Initialize context stack
evalInWindow('(function() { window.__opalReplContextStack__ = []; return true; })()');

// Test 1: Create a class and instance
console.log('\n=== Test 1: Create class and instance ===');
evalInWindow(`
  (function() {
    var code = Opal.compile(\`
      class Person
        attr_accessor :name, :age
        def initialize(name, age)
          @name = name
          @age = age
        end
        def greet
          "Hello, I'm " + @name
        end
      end
    \`, {irb: true});
    eval(code);
    return 'class defined';
  })()
`);

// Create instance separately
evalInWindow(`
  (function() {
    var code = Opal.compile('$person = Person.new("Alice", 30)', {irb: true});
    eval(code);
    return 'instance created';
  })()
`);

const personExists = evalInWindow('!!Opal.gvars.person');
const personClass = evalInWindow('Opal.gvars.person && Opal.gvars.person.$$class.$$name');
console.log('Person class created');
console.log('$person exists:', personExists);
console.log('$person class:', personClass);

// Test 2: cd into the person object
console.log('\n=== Test 2: cd into $person ===');
const cdResult = evalInWindow(`
  (function() {
    try {
      var currentContext = window.__opalReplContextStack__.length > 0
        ? window.__opalReplContextStack__[window.__opalReplContextStack__.length - 1]
        : Opal.top;

      var compiled = Opal.compile('$person', {irb: true});
      var newContext = eval(compiled);

      if (newContext === undefined || newContext === null || newContext === Opal.nil) {
        return { error: 'Target is nil or undefined' };
      }

      window.__opalReplContextStack__.push(newContext);

      var name = '';
      if (newContext.$$class) {
        name = '#<' + (newContext.$$class.$$name || 'Object') + '>';
      } else if (newContext.$$is_class || newContext.$$is_module) {
        name = newContext.$$name || 'Class';
      } else {
        name = Object.prototype.toString.call(newContext).slice(8, -1);
      }

      return { success: true, name: name };
    } catch(e) {
      return { error: e.message };
    }
  })()
`);
console.log('cd result:', cdResult);
console.log('Context stack length:', evalInWindow('window.__opalReplContextStack__.length'));

// Test 3: ls in the person context
console.log('\n=== Test 3: ls in $person context ===');
const lsResult = evalInWindow(`
  (function() {
    var result = {
      context: 'main',
      methods: [],
      instance_variables: []
    };

    try {
      var target = window.__opalReplContextStack__[window.__opalReplContextStack__.length - 1];
      if (!target) {
        result.error = 'Context object not found';
        return result;
      }

      // Get context name
      if (target.$$class) {
        result.context = '#<' + (target.$$class.$$name || 'Object') + '>';
      } else if (target.$$is_class || target.$$is_module) {
        result.context = target.$$name || 'Class';
      }

      // Get user-defined methods only (not inherited)
      if (target.$$class) {
        var klass = target.$$class;
        if (klass.$$prototype) {
          var protoKeys = Object.getOwnPropertyNames(klass.$$prototype);
          for (var i = 0; i < protoKeys.length; i++) {
            var key = protoKeys[i];
            if (key.startsWith('$') && typeof klass.$$prototype[key] === 'function') {
              var methodName = key.substring(1);
              if (methodName.length > 0 && !methodName.startsWith('_') &&
                  methodName !== 'initialize' && result.methods.indexOf(methodName) === -1) {
                result.methods.push(methodName);
              }
            }
          }
        }
      }

      // Get instance variables using Opal's method
      if (typeof target.$instance_variables === 'function') {
        var ivars = target.$instance_variables();
        for (var i = 0; i < ivars.length; i++) {
          var ivar = ivars[i];
          var ivarStr = (typeof ivar.$to_s === 'function') ? ivar.$to_s() : String(ivar);
          result.instance_variables.push(ivarStr);
        }
      }

      result.methods.sort();
      result.instance_variables.sort();

    } catch(e) {
      result.error = e.message;
    }

    return result;
  })()
`);
console.log('ls result:');
console.log('  Context:', lsResult.context);
console.log('  Methods:', lsResult.methods.filter(m => ['greet', 'name', 'name=', 'age', 'age='].includes(m)));
console.log('  Instance variables:', lsResult.instance_variables);

// Test 4: Evaluate code in context (call greet method) - using Opal.top swap
console.log('\n=== Test 4: Evaluate greet in $person context ===');
const greetResult = evalInWindow(`
  (function() {
    try {
      var context = window.__opalReplContextStack__[window.__opalReplContextStack__.length - 1];
      var compiled = Opal.compile('greet', {irb: true});

      // IRB mode uses Opal.top as 'self', so temporarily replace it
      var originalTop = Opal.top;
      var result;
      try {
        Opal.top = context;
        result = eval(compiled);
      } finally {
        Opal.top = originalTop;
      }
      return { result: result && result.$to_s ? result.$to_s() : String(result) };
    } catch(e) {
      return { error: e.message };
    }
  })()
`);
console.log('greet result:', greetResult);

// Test 5: Access instance variable in context
console.log('\n=== Test 5: Access @name in $person context ===');
const nameResult = evalInWindow(`
  (function() {
    try {
      var context = window.__opalReplContextStack__[window.__opalReplContextStack__.length - 1];
      var compiled = Opal.compile('@name', {irb: true});

      // IRB mode uses Opal.top as 'self', so temporarily replace it
      var originalTop = Opal.top;
      var result;
      try {
        Opal.top = context;
        result = eval(compiled);
      } finally {
        Opal.top = originalTop;
      }
      return { result: result && result.$to_s ? result.$to_s() : String(result) };
    } catch(e) {
      return { error: e.message };
    }
  })()
`);
console.log('@name result:', nameResult);

// Test 6: cd .. (return to main)
console.log('\n=== Test 6: cd .. ===');
evalInWindow('window.__opalReplContextStack__.pop()');
console.log('Context stack length after cd ..:', evalInWindow('window.__opalReplContextStack__.length'));

console.log('\n=== All tests completed ===');
