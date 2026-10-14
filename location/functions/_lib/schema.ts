import { z } from 'zod';
import type { ChatRequest } from '../../src/domain/chatRequest';
import { MAX_MESSAGES, MAX_POIS, MAX_TEXT_CHARS } from '../../src/domain/chatRequest';

// 小数 3 桁まで。文字列表現で判定する（1e-7 のような指数表記は弾かれる）。
const threeDecimals = (n: number) => /^-?\d+(\.\d{1,3})?$/.test(String(n));

const lat = z
  .number()
  .min(-90)
  .max(90)
  .refine(threeDecimals, { message: 'at most 3 decimal places' });
const lng = z
  .number()
  .min(-180)
  .max(180)
  .refine(threeDecimals, { message: 'at most 3 decimal places' });

const bearing = z.enum(['北', '北東', '東', '南東', '南', '南西', '西', '北西']);
const category = z.enum(['shrine_temple', 'museum', 'viewpoint', 'restaurant']);

export const chatRequestSchema = z.strictObject({
  kind: z.enum(['greeting', 'chat', 'area_suggestion']),
  place: z.strictObject({
    lat,
    lng,
    label: z.string().max(50).optional(),
    source: z.enum(['gps', 'manual']),
  }),
  pois: z.strictObject({
    status: z.enum(['ok', 'empty', 'error', 'pending']),
    radius: z.union([z.literal(1000), z.literal(5000)]).optional(),
    items: z
      .array(
        z.strictObject({
          name: z.string().min(1).max(100),
          category,
          distanceM: z.number().int().min(0).max(10000),
          bearing,
        }),
      )
      .max(MAX_POIS),
  }),
  weather: z
    .strictObject({
      tempC: z.number().finite(),
      humidity: z.number().finite(),
      label: z.string().max(20),
    })
    .nullable(),
  moved: z.strictObject({ meters: z.number().finite().min(0) }).optional(),
  messages: z
    .array(
      z.strictObject({
        role: z.enum(['user', 'assistant']),
        text: z.string().min(1).max(MAX_TEXT_CHARS),
      }),
    )
    .max(MAX_MESSAGES),
});

// 型の食い違いをコンパイル時に検出する。
type Inferred = z.infer<typeof chatRequestSchema>;
export const _assignable: (v: Inferred) => ChatRequest = (v) => v;
