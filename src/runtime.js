export function slimInt$apply () {
  if (slimInt$apply.planned) {
    return
  }
  slimInt$apply.planned = true
  setTimeout(() => {
    apply()
    slimInt$apply.planned = false
  }, 1)
}

export function slimInt$htmlToFragment (html) {
  const t = document.createElement('template')
  t.innerHTML = html
  return t.content
}

export function slimInt$removeItem (array, item) {
  const i = array.indexOf(item)
  if (i >= 0) array.splice(i, 1)
}

export function slimInt$getElement (el, a) {
  a.split(',').forEach(i => { el = el.childNodes[i] })
  return el
}

class ChangeDetector {
  constructor () {
    this.children = []
    this.watchers = []
    this.destroyList = []
  }

  watch (fn, callback) {
    this.watchers.push({ fn, callback, value: undefined })
  }

  event (el, event, callback) {
    el.addEventListener(event, callback)
    this.destroyList.push(() => el.removeEventListener(event, callback))
  }

  destroy () {
    this.watchers.length = 0
    this.destroyList.forEach(fn => fn())
    this.destroyList.length = 0
    this.children.forEach(cd => cd.destroy())
    this.children.length = 0
  }

  detect () {
    let loop = 10
    while (loop >= 0) {
      let changes = 0
      let cd = this
      const queue = []
      let queueIndex = 0
      while (cd) {
        cd.watchers.forEach(watcher => {
          const v = watcher.fn()
          if (watcher.value !== v) {
            watcher.value = v
            changes++
            watcher.callback(watcher.value)
          }
        })
        if (cd.children.length) {
          queue.push.apply(queue, cd.children)
        }
        cd = queue[queueIndex++]
      }
      if (changes <= 0) break
      loop--
    }
  }
}

export const slimInt$cd = new ChangeDetector()

export function slimInt$makeIfBlock (e, cd, parentEl, mainFr, mainName, elseFr, elseName) {
  const elements = []
  let child = null

  function create (fr, builder) {
    child = new ChangeDetector()
    cd.children.push(child)
    const el = fr.cloneNode(true)
    for (let i = 0; i < el.childNodes.length; i++) {
      elements.push(el.childNodes[i])
    }
    builder(child, el)
    parentEl.parentNode.insertBefore(el, parentEl.nextSibling)
  }

  function destroy () {
    if (!child) return

    slimInt$removeItem(slimInt$cd.children, child)
    child.destroy()
    child = null
    for (let i = 0; i < elements.length; i++) {
      elements[i].remove()
    }
    elements.length = 0
  }

  cd.watch(() => !!e(), v => {
    if (v) {
      destroy()
      create(mainFr, mainName)
    } else {
      destroy()
      if (elseFr) {
        create(elseFr, elseName)
      }
    }
  })
}

function apply () {
  slimInt$cd.detect()
}
