import { parse } from 'acorn'
import { generate } from 'astring'

export default class Parser {
  constructor (source) {
    this.source = source
  }

  parse () {
    const ast = parse(this.source, { ecmaVersion: 6 })

    apply(ast.body)

    // add slimInt$runtime() at end
    ast.body.push({
      type: 'ExpressionStatement',
      expression: {
        callee: {
          type: 'Identifier',
          name: 'slimInt$runtime'
        },
        type: 'CallExpression'
      }
    })

    // put code into `function widget(slimInt$element) { ... }`
    ast.body = [{
      type: 'ExportDefaultDeclaration', 
      declaration: {
        body: {
          type: 'BlockStatement',
          body: ast.body
        },
        id: {
          type: 'Identifier"',
          name: 'widget'
        },
        params: [{
          type: 'Identifier',
          name: 'slimInt$element'
        }],
        type: 'FunctionDeclaration'
      }
    }]

    // Back to javascript code
    return generate(ast)
  }
}

const FUNCTION_TYPES = ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']

function apply (node) {
  // add `slimInt$apply()` before every function body in node
  for (const key in node) {
    const value = node[key]
    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        value.forEach(apply)
      } else {
        apply(value)
      }
    }
  }

  if (FUNCTION_TYPES.indexOf(node.type) >= 0 && node.body.body && node.body.body.length > 0) {
    node.body.body.unshift({
      type: 'ExpressionStatement',
      expression: {
        callee: {
          type: 'Identifier',
          name: 'slimInt$apply'
        },
        type: 'CallExpression'
      }
    })
  }
}
