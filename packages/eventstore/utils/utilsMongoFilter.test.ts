import { describe, expect, it } from 'vitest'
import { transformFilterForNestedPath } from './utilsMongoFilter.js'

describe('transformFilterForNestedPath', () => {
  it('transforms simple field queries', () => {
    const input = { status: 'active', userId: '123' }
    const expected = {
      'projections.test.status': 'active',
      'projections.test.userId': '123',
    }

    const result = transformFilterForNestedPath(input, 'projections.test')
    expect(result).toEqual(expected)
  })

  it('transforms operators', () => {
    const input = { age: { $gte: 18, $lt: 65 } }
    const expected = { 'projections.test.age': { $gte: 18, $lt: 65 } }

    const result = transformFilterForNestedPath(input, 'projections.test')
    expect(result).toEqual(expected)
  })

  it('transforms array operators', () => {
    const input = { tags: { $in: ['tech', 'startup'] } }
    const expected = { 'projections.test.tags': { $in: ['tech', 'startup'] } }

    const result = transformFilterForNestedPath(input, 'projections.test')
    expect(result).toEqual(expected)
  })

  it('transforms logical operators', () => {
    const input = {
      $and: [{ status: 'active' }, { age: { $gte: 18 } }],
    }
    const expected = {
      $and: [
        { 'projections.test.status': 'active' },
        { 'projections.test.age': { $gte: 18 } },
      ],
    }

    const result = transformFilterForNestedPath(input, 'projections.test')
    expect(result).toEqual(expected)
  })

  it('transforms complex nested queries', () => {
    const input = {
      $or: [
        { status: 'active' },
        {
          $and: [
            { status: 'pending' },
            { priority: { $in: ['high', 'critical'] } },
          ],
        },
      ],
      createdAt: { $gte: new Date('2024-01-01') },
    }
    const expected = {
      '$or': [
        { 'projections.test.status': 'active' },
        {
          $and: [
            { 'projections.test.status': 'pending' },
            { 'projections.test.priority': { $in: ['high', 'critical'] } },
          ],
        },
      ],
      'projections.test.createdAt': { $gte: new Date('2024-01-01') },
    }

    const result = transformFilterForNestedPath(input, 'projections.test')
    expect(result).toEqual(expected)
  })

  it('transforms $elemMatch for arrays of objects', () => {
    const input = {
      items: {
        $elemMatch: {
          type: 'product',
          price: { $gte: 100 },
        },
      },
    }
    const expected = {
      'projections.test.items': {
        $elemMatch: {
          type: 'product',
          price: { $gte: 100 },
        },
      },
    }

    const result = transformFilterForNestedPath(input, 'projections.test')
    expect(result).toEqual(expected)
  })

  it('transforms geospatial near query', () => {
    const input = {
      items: {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [0, 0],
          },
          $maxDistance: 5000,
          $minDistance: 100,
        },
      },
    }
    const expected = {
      'projections.test.items': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [0, 0],
          },
          $maxDistance: 5000,
          $minDistance: 100,
        },
      },
    }

    const result = transformFilterForNestedPath(input, 'projections.test')
    expect(result).toEqual(expected)
  })

  it('transforms geospatial $geoWithin query', () => {
    const input = {
      address: {
        $geoWithin: {
          $geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-74.0, 40.7],
                [-74.0, 40.8],
                [-73.9, 40.8],
                [-73.9, 40.7],
                [-74.0, 40.7],
                [-74.0, 40.7],
              ],
            ],
          },
        },
      },
    }
    const expected = {
      'projections.test.address': {
        $geoWithin: {
          $geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [-74.0, 40.7],
                [-74.0, 40.8],
                [-73.9, 40.8],
                [-73.9, 40.7],
                [-74.0, 40.7],
                [-74.0, 40.7],
              ],
            ],
          },
        },
      },
    }

    const result = transformFilterForNestedPath(input, 'projections.test')
    expect(result).toEqual(expected)
  })
})
