import { assert } from './utils.js'

export default class Parser {
  constructor (source) {
    this.source = source
    this.index = 0
  }

  parse () {
    return this.innerParse(rootNode())
  }

  next () {
    assert(this.index < this.source.length, 'EOF')
    return this.source[this.index++]
  }

  move (n = 1) {
    this.index += n
  }

  peek (n = 0) {
    assert(this.index + n < this.source.length, 'EOF')
    return this.source[this.index + n] || null
  }

  ahead (n) {
    return this.source.substring(this.index, this.index + n)
  }

  innerParse (parentNode) {
    let currentTextNode = null

    function flushCurrentTextNode () {
      if (!currentTextNode || !currentTextNode.value) {
        return
      }

      parentNode.body.push(currentTextNode)
      currentTextNode = null
    }

    while (this.index < this.source.length) {
      if (this.peek() === BEGIN_TAG) {
        flushCurrentTextNode()

        if (this.ahead(4) === BEGIN_COMMENT) {
          parentNode.body.push(commentNode(this.parseComment()))
          continue
        }

        if (this.ahead(2) === BEGIN_CLOSE_TAG) {
          this.move(2)
          let name = ''
          while (true) {
            if (this.peek() === END_TAG) {
              break
            }
            name += this.next()
          }

          assert(name === parentNode.name, 'Wrong close tag')

          this.next()
          return
        }

        // If it's not a comment or close tag, it has to be a open tag
        const node = this.parseOpenTag()
        parentNode.body.push(node)
        if (node.name === 'script') {
          node.type = 'script'
          node.value = this.parseScript()
          continue
        }

        if (node.closed) {
          continue
        }

        node.body = []
        node.closed = true
        this.innerParse(node)
        continue
      } else if (this.peek() === BEGIN_BLOCK) {
        if (BEGIN_BLOCK_SIGNS.indexOf(this.peek(1)) >= 0) {
          flushCurrentTextNode()

          const value = this.parseBlockStmt()
          if (value.startsWith('#if ')) {
            const node = {
              type: 'if',
              value,
              body: []
            }
            parentNode.body.push(node)
            this.innerParse(node)
            continue
          } else if (value === '/if') {
            assert(parentNode.type === 'if', 'Block error')
            return
          } else if (value === ':else') {
            assert(parentNode.type === 'if', 'Block error')
            parentNode.main = parentNode.body
            parentNode.body = []
          } else {
            throw new Error('Block error')
          }
        }

        // Fall through to text node
      }

      // Text node is what it is
      if (!currentTextNode) {
        currentTextNode = textNode()
      }

      currentTextNode.value += this.next()
    }
    flushCurrentTextNode()

    assert(parentNode.type === 'root', 'File ends too early')
    return parentNode
  }

  parseComment () {
    const start = this.index
    let end = this.source.indexOf(END_COMMENT, start)
    assert(end >= 0, 'Comment is not closed')
    end += 3
    this.index = end
    return this.source.substring(start, end)
  }

  parseScript () {
    const start = this.index
    let quote = null
    while (true) {
      const c = this.next()
      if (quote) {
        if (c !== quote) continue
        quote = null
        continue
      }

      if (QUOTES.indexOf(c) >= 0) {
        quote = c
        continue
      }

      if (c === '<') {
        if (this.source.substring(this.index - 1, this.index + END_SCRIPT_TAG.length - 1) === END_SCRIPT_TAG) {
          const code = this.source.substring(start, this.index - 1)
          this.move(END_SCRIPT_TAG.length - 1)
          return code
        }
      }
    }
  }

  parseOpenTag () {
    assert(this.next() === BEGIN_TAG, 'Tag error')

    let name = ''
    while (true) {
      const c = this.peek()
      if (c.match(/[\da-zA-Z]/)) {
        name += c
        this.next()
        continue
      }
      break
    }
    assert(name !== '', 'Tag name error')

    const attrs = []
    let attrStartIndex = null
    const flushAttr = (shift = 0) => {
      if (!attrStartIndex) {
        return
      }
      const end = this.index + shift

      const attr = this.source.substring(attrStartIndex, end)
      const index = attr.indexOf(ATTR_EQ)
      const name = attr.substring(0, index)
      let value = attr.substring(index + 1)

      if (QUOTES2.indexOf(value[0]) >= 0) {
        value = value.substring(1)
      }
      if (QUOTES2.indexOf(value[value.length - 1]) >= 0) {
        value = value.substring(0, value.length - 1)
      }

      attrs.push({ name, value })
      attrStartIndex = null
    }

    let bind = 0
    while (true) {
      let c = this.peek()
      if (!attrStartIndex && c.match(/\S/) && c !== VOID_TAG && c !== END_TAG) {
        attrStartIndex = this.index
      }

      if (QUOTES.indexOf(c) >= 0) {
        this.next()
        // If a string shows in html tag, ignore it
        while (c !== this.next()) ;
        continue
      }

      if (attrStartIndex && (c.match(/\s/))) {
        flushAttr()
      }

      // We need a stack mechanism to trace nested {} pairs
      // <button @click={() => { handleClick() } }>
      if (c === BEGIN_BIND) {
        bind++

        this.next()
        continue
      }
      if (bind > 0) {
        if (c === END_BIND) {
          bind--
          if (bind > 0) {
            this.next()
            continue
          }
          flushAttr(1)
        }

        this.next()
        continue
      }

      if (c === VOID_TAG) {
        this.next()
        c = this.peek()

        assert(c === END_TAG, 'Wrong tag')
        flushAttr(-1)
      }

      if (c === END_TAG) {
        flushAttr()

        this.next()
        return tagNode(name, attrs, this.peek(-2) === VOID_TAG)
      }
      this.next()
    }
  }

  parseBlockStmt () {
    const start = this.index

    assert(this.next() === BEGIN_BLOCK, 'Tag error')

    let brackets = 1
    let quote = null
    while (true) {
      const c = this.next()

      if (quote) {
        if (c !== quote) continue
        quote = null
        continue
      }

      if (QUOTES.indexOf(c) >= 0) {
        quote = c
        continue
      }

      if (c === BEGIN_BIND) {
        brackets++
        continue
      }
      if (c === END_BIND) {
        brackets--
        if (brackets > 0) continue

        return this.source.substring(start + 1, this.index - 1)
      }
    }
  }
}

const BEGIN_TAG = '<'
const BEGIN_CLOSE_TAG = '</'
const END_TAG = '>'
const VOID_TAG = '/'
const BEGIN_COMMENT = '<!--'
const END_COMMENT = '-->'
const BEGIN_BLOCK = '{'
const ATTR_EQ = '='
const BEGIN_BIND = '{'
const END_BIND = '}'
const QUOTES = ['"', '`', '\'']
const QUOTES2 = ['"', '\'']
const BEGIN_BLOCK_SIGNS = ['#', '/', ':']
const END_SCRIPT_TAG = '</script>'

function textNode () {
  return { type: 'text', value: '' }
}

function rootNode () {
  return { type: 'root', body: [], value: '' }
}

function commentNode (value = '') {
  return { type: 'comment', value }
}

function tagNode (name, attributes, closed) {
  return {
    type: 'node',
    name,
    attributes,
    closed,
    voidTag: closed,
    body: [],
    value: ''
  }
}
