import { readFileSync, writeFileSync } from 'fs'
import HTMLParser from './src/html.js'
import JSParser from './src/js.js'
import build from './src/builder.js'
import { format } from './src/utils.js'

function run () {
  const source = readFileSync(process.argv[2], { encoding: 'utf-8' })
  const ast = new HTMLParser(source).parse()

  let scriptNode = null
  ast.body.forEach(node => {
    if (node.type !== 'script') {
      return
    }
    scriptNode = node
  })

  const scriptCode = new JSParser(scriptNode.value).parse()
  const runtimeCode = build(ast)

  const result = `
    import { slimInt$cd, slimInt$apply, slimInt$getElement, slimInt$htmlToFragment, slimInt$makeIfBlock } from "../src/runtime.js"
    ${scriptCode.split('slimInt$runtime();').join(runtimeCode)}
  `

  writeFileSync('bin/output.js', format(result), { encoding: 'utf8', flag: 'w' })
  console.log('Compiled.')
}

run()
