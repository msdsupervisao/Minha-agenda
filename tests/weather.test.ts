import assert from 'node:assert/strict';
import test from 'node:test';
import { createWeatherTools } from '../lib/agent/tools/weather';
import { emptyAgentContextState, type AgentExecutionContext } from '../lib/agent/contracts';
const context: AgentExecutionContext = { userId: 'test', source: 'text', timezone: 'America/Cuiaba', now: new Date(), state: emptyAgentContextState() };

test('clima sem localização pede cidade sem inferir pelo fuso', async () => {
  const [tool] = createWeatherTools(async () => { throw new Error('não deve consultar'); });
  const result = await tool.execute({ city: null, region: null }, context);
  assert.equal((result as { reason: string }).reason, 'location_required');
});

test('clima consulta fonte e devolve valores, local e horário; cidade ambígua não é escolhida', async () => {
  const urls: string[] = [];
  const [tool] = createWeatherTools((async (url) => {
    urls.push(String(url));
    if (String(url).includes('geocoding')) return Response.json({ results: [
      { id: 1, name: 'Sorriso', admin1: 'Mato Grosso', country: 'Brasil', latitude: -12.54, longitude: -55.72 },
      { id: 2, name: 'Sorriso', admin1: 'Outro estado', country: 'Brasil', latitude: -20, longitude: -50 },
      { id: 3, name: 'Sorriso Airport', admin1: 'Mato Grosso', country: 'Brasil', latitude: -12, longitude: -55 },
    ] });
    return Response.json({ timezone: 'America/Cuiaba', current: { time: Math.floor(Date.now() / 1000), temperature_2m: 28, relative_humidity_2m: 72, weather_code: 2, precipitation: 0 },
      daily: { time: [Math.floor(Date.now() / 1000)], temperature_2m_max: [32], temperature_2m_min: [22], precipitation_probability_max: [40] } });
  }) as typeof fetch);
  const ambiguous = await tool.execute({ city: 'Sorriso', region: null }, context) as Record<string, unknown>;
  assert.equal(ambiguous.reason, 'ambiguous_location');
  assert.equal(urls.length, 1);
  const result = await tool.execute({ city: 'Sorriso', region: 'Mato Grosso' }, context) as Record<string, unknown>;
  assert.equal(result.temperatureC, 28); assert.equal(result.humidityPercent, 72);
  assert.equal(result.condition, 'Parcialmente nublado'); assert.equal(result.source, 'Open-Meteo');
  assert.ok(result.observedAt); assert.match(String(result.location), /Sorriso/);
});

test('fonte indisponível não inventa temperatura', async () => {
  const [tool] = createWeatherTools(async () => Response.json({}, { status: 503 }));
  const result = await tool.execute({ city: null, region: null }, { ...context, metadata: { weatherLocation: { latitude: -12, longitude: -55 } } }) as Record<string, unknown>;
  assert.equal(result.available, false); assert.equal(result.temperatureC, undefined);
});
