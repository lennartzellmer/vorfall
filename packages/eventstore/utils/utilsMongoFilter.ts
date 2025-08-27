type MongoFilter = Record<string, any>

/**
 * Transforms a MongoDB filter to work on a nested path by prefixing field names
 * while preserving MongoDB operators and array structures
 */
export function transformFilterForNestedPath(filter: MongoFilter, nestedPath: string): MongoFilter {
  if (!filter || typeof filter !== 'object') {
    return filter
  }

  // Handle null and arrays
  if (filter === null || Array.isArray(filter)) {
    return filter
  }

  const result: MongoFilter = {}

  for (const [key, value] of Object.entries(filter)) {
    // MongoDB logical operators that contain arrays of conditions
    if (isLogicalOperator(key)) {
      result[key] = Array.isArray(value)
        ? value.map(condition => transformFilterForNestedPath(condition, nestedPath))
        : transformFilterForNestedPath(value, nestedPath)
      continue
    }

    // MongoDB operators that work on the current field (like $not)
    if (isFieldOperator(key)) {
      result[key] = transformFilterForNestedPath(value, nestedPath)
      continue
    }

    // Regular field name - prefix it with nested path
    const transformedKey = `${nestedPath}.${key}`

    // If the value is an object, we might need to transform nested operators
    if (isPlainObject(value)) {
      result[transformedKey] = transformOperatorValue(value, nestedPath, key)
    }
    else {
      result[transformedKey] = value
    }
  }

  return result
}

/**
 * Transform operator values that might contain field references
 */
function transformOperatorValue(value: any, nestedPath: string, originalKey: string): any {
  if (!isPlainObject(value)) {
    return value
  }

  const result: any = {}

  for (const [opKey, opValue] of Object.entries(value)) {
    if (opKey === '$regex' || opKey === '$options' || opKey === '$elemMatch' || !requiresTransformation(opKey)) {
      // These operators don't need field transformation
      result[opKey] = opValue
    }
    else if (Array.isArray(opValue)) {
      // Handle operators with arrays (like $in, $nin, $all)
      result[opKey] = opValue.map(item =>
        isPlainObject(item) ? transformFilterForNestedPath(item, nestedPath) : item,
      )
    }
    else if (isPlainObject(opValue)) {
      // Recursively transform nested objects
      result[opKey] = transformOperatorValue(opValue, nestedPath, originalKey)
    }
    else {
      result[opKey] = opValue
    }
  }

  return result
}

/**
 * MongoDB logical operators that contain conditions
 */
function isLogicalOperator(key: string): boolean {
  return ['$and', '$or', '$nor'].includes(key)
}

/**
 * MongoDB operators that work on the current field
 */
function isFieldOperator(key: string): boolean {
  return ['$not', '$expr', '$jsonSchema', '$where'].includes(key)
}

/**
 * Check if a value is a plain object (not array, not null, not date, etc.)
 */
function isPlainObject(value: any): boolean {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && !(value instanceof Date)
    && !(value instanceof RegExp)
}

/**
 * Operators that might need field transformation
 */
function requiresTransformation(operator: string): boolean {
  const noTransformOps = [
    '$eq',
    '$ne',
    '$gt',
    '$gte',
    '$lt',
    '$lte',
    '$in',
    '$nin',
    '$exists',
    '$type',
    '$size',
    '$regex',
    '$options',
    '$mod',
    '$all',
    '$bitsAllClear',
    '$bitsAllSet',
    '$bitsAnyClear',
    '$bitsAnySet',
  ]
  return !noTransformOps.includes(operator)
}
