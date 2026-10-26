import { useMemo } from 'react';
import { citiesInState, INDIA_STATES, type IndiaCity, type IndiaState } from '@/lib/indiaPlaces';
import { Field, Select } from './ui';

const OTHER = '__other__';

/**
 * Pick-first helpers for the location forms: choosing an entry fills the English and Hindi
 * names, so an admin never has to remember a code or type a Devanagari spelling. "Other"
 * leaves the boxes editable for places the list does not cover.
 */
export function StatePicker({
  takenCodes,
  value,
  onPick,
}: {
  takenCodes: string[];
  value: string;
  onPick: (state: IndiaState | null) => void;
}) {
  const options = useMemo(() => {
    const taken = new Set(takenCodes.map((code) => code.trim().toUpperCase()));
    return INDIA_STATES.filter((state) => !taken.has(state.code));
  }, [takenCodes]);

  const known = options.find((state) => state.code === value) ?? null;
  const manual = value !== '' && !known;

  if (options.length === 0) {
    return (
      <Field label="State or union territory" hint="All 36 states and union territories are already in the list.">
        <Select value={value} disabled>
          <option value="">Nothing left to add</option>
        </Select>
      </Field>
    );
  }

  return (
    <Field
      label="State or union territory"
      hint={known ? 'Code, English and हिंदी names fill themselves — still editable below.' : undefined}
      className="sm:col-span-2"
    >
      <Select
        value={known ? known.code : manual ? OTHER : ''}
        onChange={(event) => {
          const picked = event.target.value;
          onPick(picked === '' || picked === OTHER ? null : options.find((state) => state.code === picked) ?? null);
        }}
      >
        <option value="">Choose a state</option>
        {options.map((state) => (
          <option key={state.code} value={state.code}>
            {state.code} · {state.en} — {state.hi}
          </option>
        ))}
        {manual && <option value={OTHER}>Other · {value}</option>}
      </Select>
    </Field>
  );
}

export function CityPicker({
  stateCode,
  takenNames,
  value,
  label = 'City',
  onPick,
}: {
  stateCode: string;
  takenNames: string[];
  value: string;
  label?: string;
  onPick: (city: IndiaCity | null) => void;
}) {
  const options = useMemo(() => {
    const taken = new Set(takenNames.map((name) => name.trim().toLowerCase()));
    return citiesInState(stateCode).filter((city) => !taken.has(city.en.toLowerCase()));
  }, [stateCode, takenNames]);

  const known = options.find((city) => city.en === value) ?? null;
  const manual = value !== '' && !known;

  return (
    <Field
      label={label}
      hint={
        known
          ? 'Hindi name fills with the pick — edit below if needed.'
          : options.length === 0
            ? 'No listed city matches this state — type the name below.'
            : undefined
      }
    >
      <Select
        value={known ? known.en : manual ? OTHER : ''}
        onChange={(event) => {
          const picked = event.target.value;
          onPick(picked === '' || picked === OTHER ? null : options.find((city) => city.en === picked) ?? null);
        }}
      >
        <option value="">Choose a city ({options.length} listed)</option>
        {options.map((city) => (
          <option key={city.en} value={city.en}>
            {city.en} — {city.hi}
          </option>
        ))}
        <option value={OTHER}>{manual ? `Other · ${value}` : 'Other city (type the name)'}</option>
      </Select>
    </Field>
  );
}
