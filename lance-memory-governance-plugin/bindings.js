import { closeSync, openSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { readBindings, validateBindings } from './governance.js'

export function bindProject(file, directory, projectId) {
  if (!isAbsolute(file)) throw new Error('The bindings file path must be absolute.')
  const [[root, id]] = validateBindings({ [directory]: projectId })
  const lock = `${file}.lock`
  const fd = openSync(lock, 'wx')
  let moved = false
  try {
    try {
      let existing
      try {
        existing = readBindings(file)
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
        existing = {}
      }
      const projects = validateBindings(existing)
      if (projects.has(root)) {
        if (projects.get(root) !== id) {
          throw new Error(`${root} is already bound to ${projects.get(root)}. Edit projects.json explicitly to reassign it.`)
        }
        return root
      }
      projects.set(root, id)
      writeFileSync(fd, `${JSON.stringify(Object.fromEntries(projects), null, 2)}\n`, 'utf8')
    } finally {
      closeSync(fd)
    }
    renameSync(lock, file)
    moved = true
    return root
  } finally {
    if (!moved) unlinkSync(lock)
  }
}
