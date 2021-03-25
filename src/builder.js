import { assert } from './utils.js'

export default function build (ast) {
  const { name, source, template } = buildBlock(ast)

  return `${source}
  slimInt$element.innerHTML = \`${template}\`
  ${name}(slimInt$cd, slimInt$element)
  slimInt$apply()
  `
}

let globalIndex = 0

function buildBlock (ast) {
  const levels = []
  const binds = []
  const elements = []
  const template = []

  function elementName () {
    let el = null
    if (levels.length) {
      el = `slimInt$getElement(el, '${levels.join(',')}')`
    } else {
      el = '$element'
    }

    if (!elements[el]) {
      elements[el] = `el${globalIndex++}`
      binds.push(`let ${elements[el]} = ${el}`)
    }

    return elements[el]
  }

  function innerBuild (level, parentNode) {
    let index = 0
    const setLevel = () => {
      levels[level] = index++
    }

    parentNode.body.forEach(node => {
      if (node.type === 'script' || node.type === 'style' || node.type === 'comment') {
        return
      }

      let lastTextIndex = null
      if (node.type === 'text') {
        if (lastTextIndex !== template.length) {
          setLevel()
        }
        if (node.value.indexOf('{') >= 0) {
          template.push(' ')
          const expr = parseText(node.value)
          binds.push(`cd.watch(() => ${expr}, v => {${elementName()}.textContent = v})`)
        } else {
          template.push(node.value.replace(/\n+/g, ' '))
        }
        lastTextIndex = template.length
      } else if (node.type === 'node') {
        setLevel()
        let el = `<${node.name} `
        node.attributes.forEach(attr => {
          const b = makeBind(attr, elementName())
          if (b.bind) {
            binds.push(b.bind)
          } else {
            el += `${attr.name}=${attr.value} `
          }
        })

        if (node.voidTag) {
          el += '/>'
          template.push(el)
        } else {
          el += '>'
          template.push(el)
          innerBuild(level + 1, node)
          template.push(`</${node.name}>`)
        }
      } else if (node.type === 'each') {
        setLevel()
      } else if (node.type === 'if') {
        setLevel()
        template.push(`<!-- ${node.value} -->`)
        binds.push(makeIfBlock(node, elementName()).source)
      } else {
        throw new Error('Wrong node')
      }
    })

    levels.length = level
  }

  innerBuild(0, ast)

  const buildName = `slimInt$build${globalIndex++}`
  return {
    name: buildName,
    source: `
    function ${buildName}(cd, el) {
      ${binds.join('\n')}
    }
    `,
    template: Q(template.join(''))
  }
}

function parseText (source) {
  let i = 0
  let bind = false
  let text = ''
  let exp = ''
  const result = []
  let quote = null
  const len = source.length
  while (i < len) {
    const c = source[i++]
    if (bind === true) {
      if (quote) {
        if (c === quote) quote = null
        exp += c
        continue
      }
      if (c === '"' || c === "'") {
        quote = c
        exp += c
        continue
      }
      if (c === '}') {
        bind = false
        result.push('(' + exp + ')')
        exp = ''
        continue
      }
      exp += c
      continue
    }
    if (c === '{') {
      if (text) {
        result.push('`' + Q(text) + '`')
        text = ''
      }
      bind = true
      continue
    }
    text += c
  }
  if (text) result.push('`' + Q(text) + '`')
  if (bind) {
    throw new Error('Wrong expression')
  }
  return result.join('+')
}

function Q (s) {
  return s.replace(/`/g, '\\`')
}

function makeBind (attribute, elName) {
  const parts = attribute.name.split(':')

  if (parts[0] === 'on') {
    const e = parseExpression(attribute.value)
    return {
      bind: `cd.event(${elName}, "${parts[1]}", e => { slimInt$apply(); ${Q(e)} })`
    }
  } else if (parts[0] === 'bind') {
    const e = parseExpression(attribute.value)
    if (parts[1] === 'value') {
      return {
        bind: `
          cd.event(${elName}, 'input', () => { ${e} = ${elName}.value; slimInt$apply(); })
          cd.watch(() => (${e}), v => { if(v != ${elName}.value) ${elName}.value = v })
        `
      }
    } else {
      assert(false, 'Not supported bind')
    }
  } else {
    if (attribute.value && attribute.value.indexOf('{') >= 0) {
      const e = parseText(attribute.value)
      return {
        bind: `cd.watch(() => (${e}), v => { ${elName}.setAttribute('${attribute.name}', v) })`
      }
    }
    return { bind: null }
  }
}

function parseExpression (s) {
  const e = s.match(/^\{(.*)\}$/)[1]
  assert(e, 'Wrong expression')
  return e
}

function makeIfBlock (node, elName) {
  const e = node.value.match(/^#if (.*)$/)[1]
  assert(e, 'Wrong if block')
  const funcName = `ifBlock${globalIndex++}`
  const source = [`function ${funcName}(cd, el) {`]
  let mainBlock = null
  let elseBlock = null
  if (node.main) {
    mainBlock = buildBlock({ body: node.main })
    elseBlock = buildBlock(node)
    source.push(`
      const elseFr = slimInt$htmlToFragment(\`${Q(elseBlock.template)}\`)
      ${elseBlock.source}
    `)
  } else {
    mainBlock = buildBlock(node)
    elseBlock = { name: null }
    source.push(`
      const elseFr = null
    `)
  }

  source.push(`
    let mainFr = slimInt$htmlToFragment(\`${Q(mainBlock.template)}\`)
    ${mainBlock.source}
  `)
  source.push(`
    slimInt$makeIfBlock(() => ${e}, cd, el, mainFr, ${mainBlock.name}, elseFr, ${elseBlock.name})
  }
  ${funcName}(cd, ${elName})
  `)

  return {
    source: source.join('\n')
  }
}
