import { z } from 'zod';
import { badRequest } from './errors.js';

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');

export const idSchema = z.coerce.number().int().positive().max(2147483647);
export const importRunLimitSchema = z.coerce.number().int().min(1).max(12).default(6);

const optionalBoolean = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true' ? true : value === 'false' ? false : undefined);

const safeSearchSchema = z.string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-zA-Z0-9\s.'&()/,+-]+$/)
  .optional();

const allergenValues = new Set([
  'egg',
  'shellfish',
  'soy',
  'peanut',
  'wheat',
  'tree_nut',
  'milk',
  'sesame',
  'fish'
]);

const allergenFreeSchema = z.string()
  .max(120)
  .optional()
  .refine((value) => {
    if (!value) return true;
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .every((item) => allergenValues.has(item));
  }, 'Unsupported allergen filter');

export const foodFilterSchema = z.object({
  date: dateSchema.optional(),
  q: safeSearchSchema,
  vegan: optionalBoolean,
  vegetarian: optionalBoolean,
  glutenFree: optionalBoolean,
  allergenFree: allergenFreeSchema,
  maxCalories: z.coerce.number().int().min(0).max(2000).optional(),
  minProtein: z.coerce.number().int().min(0).max(200).optional()
});

export function parseOrThrow(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw badRequest('Invalid request input', result.error.flatten());
  }
  return result.data;
}
