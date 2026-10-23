import { describe, expect, it } from 'vitest'
import { layoutRect, translationOf } from './agenda-dnd'

describe('translationOf', () => {
  it('reads the translation out of a computed 2D matrix', () => {
    expect(translationOf('matrix(1, 0, 0, 1, 12, -50)')).toEqual([12, -50])
  })

  it('reads it out of a 3D one too', () => {
    expect(translationOf('matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 7, 30, 0, 1)')).toEqual([
      7, 30,
    ])
  })

  it('is nothing for no transform', () => {
    expect(translationOf('none')).toEqual([0, 0])
    expect(translationOf('')).toEqual([0, 0])
  })
})

describe('layoutRect', () => {
  it('undoes the shift of every ancestor, not just the row’s own', () => {
    const region = document.createElement('section')
    region.className = 'gw-agenda'
    const breakout = document.createElement('div')
    const strand = document.createElement('div')
    region.append(breakout)
    breakout.append(strand)
    document.body.append(region)

    // A breakout making room by 50px; its strand sits still inside it. jsdom
    // has no layout, so the box and the computed matrix are stated outright.
    strand.getBoundingClientRect = () =>
      ({ top: 130, bottom: 300, left: 0, right: 400, width: 400, height: 170 }) as DOMRect
    breakout.style.transform = 'matrix(1, 0, 0, 1, 0, 50)'

    expect(layoutRect(strand)).toMatchObject({ top: 80, bottom: 250, left: 0, height: 170 })
    region.remove()
  })
})
