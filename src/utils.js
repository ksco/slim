import { parse } from 'acorn'
import { generate } from 'astring'

export function assert (exp, err) {
  if (!exp) {
    throw new Error(err)
  }
}

export function format (source) {
  return generate(parse(source, { ecmaVersion: 6, sourceType: 'module' }))
}
