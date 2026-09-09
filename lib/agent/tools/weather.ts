import { z } from 'zod';
import type { AgentTool, JsonObject } from '../contracts';

const number = z.number().finite();
const forecastSchema = z.object({
  timezone: z.string(),
  current: z.object({ time: number, temperature_2m: number, relative_humidity_2m: number, weather_code: number, precipitation: number }),
  daily: z.object({ time: z.array(number), temperature_2m_max: z.array(number), temperature_2m_min: z.array(number), precipitation_probability_max: z.array(number.nullable()) }),
});
const placesSchema = z.object({ results: z.array(z.object({
  id: number, name: z.string(), latitude: number, longitude: number,
  admin1: z.string().optional(), country: z.string().optional(),
})).optional() });
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function createWeatherTools(request: typeof fetch = fetch): AgentTool<JsonObject>[] {
  async function json(url: URL) {
    const response = await request(url, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!response.ok) throw new Error('weather_source_unavailable');
    return response.json();
  }
  return [{
    name: 'get_weather', risk: 'read',
    description: 'Consulta clima atual e previsão dos próximos 7 dias no Open-Meteo. Use city e region (estado por extenso/país) informados pelo usuário; null usa a localização autorizada do dispositivo. Não invente cidade pelo fuso. Em ambiguidade, pergunte qual cidade/estado. Informe fonte, horário e local; dados atuais são estimativas meteorológicas atualizadas.',
    inputSchema: z.object({ city: z.string().trim().min(2).max(100).nullable(), region: z.string().trim().min(2).max(100).nullable() }).strict(),
    async execute(input, context): Promise<JsonObject> {
      try {
        let latitude: number; let longitude: number; let location: string;
        if (typeof input.city === 'string') {
          const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
          url.search = new URLSearchParams({ name: input.city, count: '10', language: 'pt', format: 'json' }).toString();
          const places = placesSchema.parse(await json(url)).results || [];
          const regional = places.filter((p) => !input.region || normalize(`${p.admin1 || ''} ${p.country || ''}`).includes(normalize(String(input.region))));
          const exact = regional.filter((p) => normalize(p.name) === normalize(String(input.city)));
          const matches = exact.length ? exact : regional;
          if (matches.length !== 1) return { available: false, reason: matches.length ? 'ambiguous_location' : 'location_not_found',
            candidates: matches.map((p) => ({ city: p.name, region: p.admin1 || '', country: p.country || '' })),
            guidance: 'Pergunte a cidade e o estado/país antes de consultar.' };
          const place = matches[0]; latitude = place.latitude; longitude = place.longitude;
          location = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
        } else {
          const supplied = context.metadata?.weatherLocation as JsonObject | undefined;
          if (!supplied || typeof supplied.latitude !== 'number' || typeof supplied.longitude !== 'number') {
            return { available: false, reason: 'location_required', guidance: 'Pergunte a cidade e estado ou peça para usar o botão de localização para clima.' };
          }
          latitude = supplied.latitude; longitude = supplied.longitude; location = 'Localização autorizada do dispositivo';
        }
        const url = new URL('https://api.open-meteo.com/v1/forecast');
        url.search = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude),
          current: 'temperature_2m,relative_humidity_2m,weather_code,precipitation',
          daily: 'temperature_2m_max,temperature_2m_min,precipitation_probability_max',
          timezone: 'auto', timeformat: 'unixtime', forecast_days: '7' }).toString();
        const data = forecastSchema.parse(await json(url));
        if (Math.abs(Date.now() - data.current.time * 1000) > 3 * 3600000) throw new Error('weather_data_stale');
        return { available: true, source: 'Open-Meteo', sourceUrl: 'https://open-meteo.com/',
          dataKind: 'Estimativa meteorológica atualizada; não é medição de um sensor do aparelho.',
          location, timezone: data.timezone, fetchedAt: new Date().toISOString(),
          observedAt: new Date(data.current.time * 1000).toISOString(),
          temperatureC: data.current.temperature_2m, humidityPercent: data.current.relative_humidity_2m,
          condition: weatherCondition(data.current.weather_code), precipitationMm: data.current.precipitation,
          forecast: data.daily.time.map((time, i) => ({ date: new Date(time * 1000).toISOString(),
            maxC: data.daily.temperature_2m_max[i] ?? null, minC: data.daily.temperature_2m_min[i] ?? null,
            rainProbabilityPercent: data.daily.precipitation_probability_max[i] ?? null })),
        };
      } catch {
        return { available: false, reason: 'weather_source_unavailable', guidance: 'Não consegui consultar dados atualizados agora. Não invente valores.' };
      }
    },
  }];
}

export function weatherCondition(code: number): string {
  if (code === 0) return 'Céu limpo';
  if (code === 1) return 'Predominantemente limpo';
  if (code === 2) return 'Parcialmente nublado';
  if (code === 3) return 'Nublado';
  if ([45, 48].includes(code)) return 'Nevoeiro';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Garoa';
  if ([61, 63, 65, 66, 67].includes(code)) return 'Chuva';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Neve';
  if ([80, 81, 82].includes(code)) return 'Pancadas de chuva';
  if ([95, 96, 99].includes(code)) return 'Trovoadas';
  return 'Condição não informada';
}
